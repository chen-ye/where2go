import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres, { type Options, type Sql } from 'postgres';

export type SqlClient = Sql<Record<string, never>>;

export interface DbPingerConfig {
  databaseUrl?: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl: Options<Record<string, never>>['ssl'];
  mode: 'write' | 'read';
  intervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PingResult {
  success: boolean;
  durationMs: number;
  serverTime?: string;
  mode?: 'write' | 'read';
  warning?: string;
  error?: Error;
}

export interface DbPingerController {
  stop: () => Promise<void>;
  pingNow: () => Promise<PingResult>;
  isRunning: () => boolean;
}

export interface LoggerInterface {
  log: (message: string) => void;
  error: (message: string, error?: unknown) => void;
  warn: (message: string) => void;
}

/**
 * Loads environment variables from .env if present.
 */
export function loadEnvFiles(): void {
  const possiblePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')];

  for (const envPath of possiblePaths) {
    if (existsSync(envPath)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(envPath);
          break;
        }
      } catch {
        // Silently continue if .env could not be loaded
      }
    }
  }
}

/**
 * Parses ping configuration from environment variables and CLI arguments.
 */
export function getPingConfig(cliArgs: string[] = []): DbPingerConfig {
  loadEnvFiles();

  // CLI argument overrides
  let cliIntervalMinutes: number | undefined;
  let cliMode: 'write' | 'read' | undefined;

  for (const arg of cliArgs) {
    if (arg.startsWith('--interval=')) {
      const parsed = Number.parseFloat(arg.slice('--interval='.length));
      if (!Number.isNaN(parsed) && parsed > 0) {
        cliIntervalMinutes = parsed;
      }
    } else if (arg === '--read-only' || arg === '--mode=read') {
      cliMode = 'read';
    } else if (arg === '--mode=write') {
      cliMode = 'write';
    }
  }

  // Interval calculation: CLI arg > DB_PING_INTERVAL_MS > DB_PING_INTERVAL_MINUTES > default (60 mins / 1 hour)
  let intervalMs = 60 * 60 * 1000;

  if (cliIntervalMinutes !== undefined) {
    intervalMs = Math.round(cliIntervalMinutes * 60 * 1000);
  } else if (process.env.DB_PING_INTERVAL_MS) {
    const parsedMs = Number.parseInt(process.env.DB_PING_INTERVAL_MS, 10);
    if (!Number.isNaN(parsedMs) && parsedMs > 0) {
      intervalMs = parsedMs;
    }
  } else if (process.env.DB_PING_INTERVAL_MINUTES) {
    const parsedMins = Number.parseFloat(process.env.DB_PING_INTERVAL_MINUTES);
    if (!Number.isNaN(parsedMins) && parsedMins > 0) {
      intervalMs = Math.round(parsedMins * 60 * 1000);
    }
  }

  // Ping mode: defaults to 'write' (heartbeat table upsert) to ensure disk & WAL activity
  let mode: 'write' | 'read' = 'write';
  if (cliMode !== undefined) {
    mode = cliMode;
  } else if (process.env.DB_PING_MODE === 'read') {
    mode = 'read';
  }

  const timeoutMs = process.env.DB_PING_TIMEOUT_MS
    ? Number.parseInt(process.env.DB_PING_TIMEOUT_MS, 10) || 10000
    : 10000;

  const maxRetries = process.env.DB_PING_MAX_RETRIES
    ? Number.parseInt(process.env.DB_PING_MAX_RETRIES, 10) || 2
    : 2;

  const retryDelayMs = process.env.DB_PING_RETRY_DELAY_MS
    ? Number.parseInt(process.env.DB_PING_RETRY_DELAY_MS, 10) || 15000
    : 15000;

  return {
    databaseUrl: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || 'localhost',
    port: Number.parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'where2go',
    password: process.env.PGPASSWORD || 'password',
    database: process.env.PGDATABASE || 'where2go',
    ssl: (process.env.PGSSLMODE as Options<Record<string, never>>['ssl']) || 'prefer',
    mode,
    intervalMs,
    timeoutMs,
    maxRetries,
    retryDelayMs,
  };
}

/**
 * Creates a dedicated, low-footprint postgres connection pool for pings.
 */
export function createDbClient(config: DbPingerConfig): SqlClient {
  const timeoutSeconds = Math.max(1, Math.ceil(config.timeoutMs / 1000));

  if (config.databaseUrl) {
    return postgres(config.databaseUrl, {
      ssl: config.ssl,
      connect_timeout: timeoutSeconds,
      idle_timeout: 30,
      max: 1,
    });
  }

  return postgres({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connect_timeout: timeoutSeconds,
    idle_timeout: 30,
    max: 1,
  });
}

/**
 * Executes a keep-alive query against the database.
 * If mode === 'write' (default), performs an UPSERT on `_keepalive` to generate WAL / disk activity.
 * If write fails (e.g. read-only permissions), automatically falls back to a read query (`SELECT 1`).
 */
export async function pingDatabase(
  sql: SqlClient,
  mode: 'write' | 'read' = 'write',
): Promise<PingResult> {
  const startTime = performance.now();

  if (mode === 'write') {
    try {
      // 1. Ensure heartbeat table exists
      await sql`
        CREATE TABLE IF NOT EXISTS _keepalive (
          id INT PRIMARY KEY,
          last_ping TIMESTAMPTZ NOT NULL
        );
      `;

      // 2. Perform atomic upsert to produce write activity & advance LSN/WAL
      const result = await sql<{ last_ping: string }[]>`
        INSERT INTO _keepalive (id, last_ping)
        VALUES (1, NOW())
        ON CONFLICT (id) DO UPDATE SET last_ping = EXCLUDED.last_ping
        RETURNING last_ping::text;
      `;

      const durationMs = performance.now() - startTime;
      const serverTime = result[0]?.last_ping;

      return {
        success: true,
        durationMs,
        serverTime,
        mode: 'write',
      };
    } catch (writeError) {
      // Fall back to read-only ping if write fails (e.g. read-only user / replica)
      try {
        const readResult = await sql<{ alive: number; server_time: string }[]>`
          SELECT 1 AS alive, NOW()::text AS server_time;
        `;
        const durationMs = performance.now() - startTime;
        return {
          success: true,
          durationMs,
          serverTime: readResult[0]?.server_time,
          mode: 'read',
          warning: `Write heartbeat failed (${(writeError as Error).message}), fell back to read ping.`,
        };
      } catch {
        const durationMs = performance.now() - startTime;
        return {
          success: false,
          durationMs,
          error: writeError instanceof Error ? writeError : new Error(String(writeError)),
        };
      }
    }
  }

  // Read-only mode
  try {
    const result = await sql<{ alive: number; server_time: string }[]>`
      SELECT 1 AS alive, NOW()::text AS server_time;
    `;
    const durationMs = performance.now() - startTime;
    const serverTime = result[0]?.server_time;

    return {
      success: true,
      durationMs,
      serverTime,
      mode: 'read',
    };
  } catch (caughtError) {
    const durationMs = performance.now() - startTime;
    return {
      success: false,
      durationMs,
      error: caughtError instanceof Error ? caughtError : new Error(String(caughtError)),
    };
  }
}

export interface StartDbPingerOptions {
  config?: DbPingerConfig;
  sqlClient?: SqlClient;
  logger?: LoggerInterface;
}

/**
 * Starts the database keep-alive ping loop.
 */
export function startDbPinger(options: StartDbPingerOptions = {}): DbPingerController {
  const config = options.config ?? getPingConfig();
  const sql = options.sqlClient ?? createDbClient(config);
  const logger: LoggerInterface = options.logger ?? console;

  let isRunning = true;
  let timerId: NodeJS.Timeout | null = null;
  const ownsClient = !options.sqlClient;

  const targetDescription = config.databaseUrl
    ? 'DATABASE_URL'
    : `postgres://${config.user}@${config.host}:${config.port}/${config.database}`;

  logger.log(
    `[DB Ping] Initialized keep-alive pinger for ${targetDescription} (Interval: ${Math.round(
      config.intervalMs / 60000,
    )}m, Mode: ${config.mode})`,
  );

  async function executePingWithRetries(attemptNumber = 1): Promise<PingResult> {
    const result = await pingDatabase(sql, config.mode);
    const timestamp = new Date().toISOString();

    if (result.success) {
      const durationFormatted = `${result.durationMs.toFixed(1)}ms`;
      const nextPingFormatted = `${(config.intervalMs / 60000).toFixed(0)}m`;
      const modeLabel = result.mode === 'write' ? 'Write heartbeat' : 'Read ping';
      const warningSuffix = result.warning ? ` [Warning: ${result.warning}]` : '';

      logger.log(
        `[${timestamp}] [DB Ping] ${modeLabel} success (${durationFormatted}). Server time: ${
          result.serverTime || 'N/A'
        }.${warningSuffix} Next ping in ${nextPingFormatted}.`,
      );
      return result;
    }

    logger.error(
      `[${timestamp}] [DB Ping] Attempt ${attemptNumber}/${config.maxRetries + 1} failed (${result.durationMs.toFixed(1)}ms): ${result.error?.message}`,
    );

    if (attemptNumber <= config.maxRetries && isRunning) {
      logger.warn(`[${timestamp}] [DB Ping] Scheduling retry in ${config.retryDelayMs / 1000}s...`);
      await new Promise<void>((resolvePromise) => {
        timerId = setTimeout(resolvePromise, config.retryDelayMs);
      });
      if (isRunning) {
        return executePingWithRetries(attemptNumber + 1);
      }
    }

    return result;
  }

  function scheduleNextPing(): void {
    if (!isRunning) return;

    timerId = setTimeout(async () => {
      if (!isRunning) return;
      await executePingWithRetries();
      scheduleNextPing();
    }, config.intervalMs);
  }

  // Execute initial ping and begin recurring schedule
  executePingWithRetries().then(() => {
    scheduleNextPing();
  });

  return {
    async stop(): Promise<void> {
      isRunning = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (ownsClient) {
        try {
          await sql.end({ timeout: 5 });
        } catch (endError) {
          logger.warn(
            `[DB Ping] Error closing database connection: ${(endError as Error).message}`,
          );
        }
      }
    },
    async pingNow(): Promise<PingResult> {
      return executePingWithRetries();
    },
    isRunning(): boolean {
      return isRunning;
    },
  };
}

/**
 * CLI Entrypoint for standalone worker execution.
 */
export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      `
where2go Database Keep-Alive Subservice

Usage:
  node backend/jobs/db-pinger.ts [options]
  yarn ping-db [options]

Options:
  --once                 Run a single ping query and exit (code 0 on success, 1 on error)
  --interval=<minutes>   Ping interval in minutes (default: 60)
  --mode=<write|read>    Ping mode (default: write - updates _keepalive table to produce WAL activity)
  --read-only            Shortcut for --mode=read (SELECT 1 only)
  --help, -h             Show this help message

Environment Variables:
  DATABASE_URL               PostgreSQL connection URI
  PGHOST, PGPORT, PGUSER,    Individual PostgreSQL parameters
  PGPASSWORD, PGDATABASE,
  PGSSLMODE
  DB_PING_MODE               'write' (default) or 'read'
  DB_PING_INTERVAL_MINUTES   Ping interval in minutes (default: 60)
  DB_PING_INTERVAL_MS        Ping interval in milliseconds
  DB_PING_TIMEOUT_MS         Connection/query timeout in ms (default: 10000)
  DB_PING_MAX_RETRIES        Max retries per interval attempt (default: 2)
  DB_PING_RETRY_DELAY_MS     Delay between retries in ms (default: 15000)
    `.trim(),
    );
    return;
  }

  const config = getPingConfig(args);

  if (args.includes('--once')) {
    console.log(`[DB Ping] Running single keep-alive check (Mode: ${config.mode})...`);
    const sql = createDbClient(config);
    try {
      const result = await pingDatabase(sql, config.mode);
      if (result.success) {
        const modeLabel = result.mode === 'write' ? 'Write heartbeat' : 'Read ping';
        console.log(
          `[DB Ping] ${modeLabel} success (${result.durationMs.toFixed(1)}ms). Server time: ${
            result.serverTime || 'N/A'
          }${result.warning ? ` [Warning: ${result.warning}]` : ''}`,
        );
        await sql.end({ timeout: 5 });
        process.exit(0);
      } else {
        console.error(`[DB Ping] Ping failed: ${result.error?.message}`);
        await sql.end({ timeout: 5 });
        process.exit(1);
      }
    } catch (caughtError) {
      console.error(`[DB Ping] Fatal error: ${(caughtError as Error).message}`);
      await sql.end({ timeout: 5 });
      process.exit(1);
    }
  }

  const pinger = startDbPinger({ config });

  const handleTermination = async (signal: string) => {
    console.log(`\n[DB Ping] Received ${signal}. Shutting down keep-alive subservice...`);
    await pinger.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    handleTermination('SIGINT');
  });
  process.on('SIGTERM', () => {
    handleTermination('SIGTERM');
  });
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    return resolve(process.argv[1]) === resolve(currentFilePath);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli().catch((fatalError) => {
    console.error('[DB Ping] Fatal startup error:', fatalError);
    process.exit(1);
  });
}
