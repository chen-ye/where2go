import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPingConfig,
  type LoggerInterface,
  pingDatabase,
  type SqlClient,
  startDbPinger,
} from '../jobs/db-pinger.ts';

describe('db-pinger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.DB_PING_MODE;
    delete process.env.DB_PING_INTERVAL_MS;
    delete process.env.DB_PING_INTERVAL_MINUTES;
    delete process.env.DB_PING_TIMEOUT_MS;
    delete process.env.DB_PING_MAX_RETRIES;
    delete process.env.DB_PING_RETRY_DELAY_MS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getPingConfig', () => {
    it('should default to write mode, 1 hour (3,600,000 ms), and default PG settings', () => {
      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;
      delete process.env.PGDATABASE;
      delete process.env.PGSSLMODE;

      const config = getPingConfig();
      expect(config.mode).toBe('write');
      expect(config.intervalMs).toBe(60 * 60 * 1000);
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.user).toBe('where2go');
      expect(config.database).toBe('where2go');
      expect(config.timeoutMs).toBe(10000);
      expect(config.maxRetries).toBe(2);
      expect(config.retryDelayMs).toBe(15000);
    });

    it('should respect DB_PING_MODE environment variable', () => {
      process.env.DB_PING_MODE = 'read';
      const config = getPingConfig();
      expect(config.mode).toBe('read');
    });

    it('should respect CLI --mode and --read-only arguments', () => {
      expect(getPingConfig(['--mode=read']).mode).toBe('read');
      expect(getPingConfig(['--read-only']).mode).toBe('read');
      expect(getPingConfig(['--mode=write']).mode).toBe('write');
    });

    it('should respect DB_PING_INTERVAL_MINUTES environment variable', () => {
      process.env.DB_PING_INTERVAL_MINUTES = '30';
      const config = getPingConfig();
      expect(config.intervalMs).toBe(30 * 60 * 1000);
    });

    it('should respect DB_PING_INTERVAL_MS environment variable', () => {
      process.env.DB_PING_INTERVAL_MS = '45000';
      const config = getPingConfig();
      expect(config.intervalMs).toBe(45000);
    });

    it('should allow CLI --interval argument to take precedence over environment variables', () => {
      process.env.DB_PING_INTERVAL_MINUTES = '60';
      const config = getPingConfig(['--interval=15']);
      expect(config.intervalMs).toBe(15 * 60 * 1000);
    });

    it('should parse DATABASE_URL if present', () => {
      process.env.DATABASE_URL =
        'postgres://avnadmin:secret@aiven-db.example.com:25432/defaultdb?sslmode=require';
      const config = getPingConfig();
      expect(config.databaseUrl).toBe(process.env.DATABASE_URL);
    });
  });

  describe('pingDatabase', () => {
    it('should perform write heartbeat by default', async () => {
      const mockSql = vi
        .fn()
        // First call: CREATE TABLE IF NOT EXISTS
        .mockResolvedValueOnce([])
        // Second call: INSERT ... RETURNING last_ping
        .mockResolvedValueOnce([{ last_ping: '2026-09-23 11:30:00' }]) as unknown as SqlClient;

      const result = await pingDatabase(mockSql, 'write');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('write');
      expect(result.serverTime).toBe('2026-09-23 11:30:00');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should fall back to read ping if write fails', async () => {
      const mockSql = vi
        .fn()
        // First call (write attempt) fails:
        .mockRejectedValueOnce(new Error('permission denied for table _keepalive'))
        // Fallback call (SELECT 1) succeeds:
        .mockResolvedValueOnce([
          { alive: 1, server_time: '2026-09-23 11:30:05' },
        ]) as unknown as SqlClient;

      const result = await pingDatabase(mockSql, 'write');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('read');
      expect(result.serverTime).toBe('2026-09-23 11:30:05');
      expect(result.warning).toContain('permission denied');
    });

    it('should execute read ping in read mode', async () => {
      const mockSql = vi
        .fn()
        .mockResolvedValue([
          { alive: 1, server_time: '2026-09-23 11:30:00' },
        ]) as unknown as SqlClient;

      const result = await pingDatabase(mockSql, 'read');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('read');
      expect(result.serverTime).toBe('2026-09-23 11:30:00');
    });

    it('should return failure when query fails', async () => {
      const mockSql = vi
        .fn()
        .mockRejectedValue(new Error('Connection terminated unexpectedly')) as unknown as SqlClient;

      const result = await pingDatabase(mockSql, 'read');
      expect(result.success).toBe(false);
      expect(result.serverTime).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Connection terminated unexpectedly');
    });
  });

  describe('startDbPinger', () => {
    it('should execute initial ping and allow graceful stopping', async () => {
      const mockSqlFn = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ last_ping: '2026-09-23 12:00:00' }]);
      const mockSql = mockSqlFn as unknown as SqlClient;

      const logs: string[] = [];
      const errors: string[] = [];
      const mockLogger: LoggerInterface = {
        log: (msg: string) => logs.push(msg),
        error: (msg: string) => errors.push(msg),
        warn: (msg: string) => logs.push(msg),
      };

      const controller = startDbPinger({
        config: {
          host: 'localhost',
          port: 5432,
          user: 'test',
          database: 'test',
          ssl: 'prefer',
          mode: 'write',
          intervalMs: 100000,
          timeoutMs: 1000,
          maxRetries: 1,
          retryDelayMs: 100,
        },
        sqlClient: mockSql,
        logger: mockLogger,
      });

      expect(controller.isRunning()).toBe(true);

      // Perform a manual ping through controller
      mockSqlFn
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ last_ping: '2026-09-23 12:00:01' }]);
      const pingResult = await controller.pingNow();
      expect(pingResult.success).toBe(true);

      await controller.stop();
      expect(controller.isRunning()).toBe(false);
      expect(logs.some((line) => line.includes('Success') || line.includes('success'))).toBe(true);
      expect(errors).toHaveLength(0);
    });
  });
});
