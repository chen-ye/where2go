import process from 'node:process';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Options } from 'postgres';
import * as schema from './schema.ts';

const connectionString = 'postgres://username:password@host:1234/database';

const pgClient = postgres(connectionString, {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  username: process.env.PGUSER || 'where2go',
  password: process.env.PGPASSWORD || 'password',
  database: process.env.PGDATABASE || 'where2go',
  ssl: (process.env.PGSSLMODE as Options<{}>['ssl']) || 'prefer',
});
console.log(
  `Connection settings: postgres://${pgClient.options.user}@${pgClient.options.host}:${pgClient.options.port}/${pgClient.options.database}`,
);

// Proxy to log query execution time
const queryClient = new Proxy(pgClient, {
  get(target, prop, receiver) {
    const originalValue = Reflect.get(target, prop, receiver);

    if (prop === 'unsafe') {
      return (query: string, params?: unknown[], options?: unknown) => {
        const start = performance.now();
        // eslint-disable-next-line @typescript-eslint/ban-types
        const result = (originalValue as typeof pgClient.unsafe).apply(target, [
          query,
          params,
          options,
        ]);

        // Monkey-patch .then to log execution time while preserving the object structure
        // (so methods like .values() still work)
        const originalThen = result.then;
        result.then = function <TResult1 = any, TResult2 = never>(
          onFulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return originalThen.call(
            this,

            (data: any) => {
              const duration = performance.now() - start;
              const timestamp = new Date().toISOString();
              console.log(`[${timestamp}] [SQL] ${query} -- [${duration.toFixed(2)}ms]`);
              if (onFulfilled) return onFulfilled(data);
              return data;
            },

            (err: any) => {
              const duration = performance.now() - start;
              const timestamp = new Date().toISOString();
              console.error(
                `[${timestamp}] [SQL ERROR] ${query} -- [${duration.toFixed(2)}ms]`,
                err,
              );
              if (onRejected) return onRejected(err);
              throw err;
            },
          ) as Promise<TResult1 | TResult2>;
        };

        return result;
      };
    }

    return originalValue;
  },
});

export const db = drizzle(queryClient, { schema });

/**
 * Initializes the database schema and extensions.
 * - Enables PostGIS extension.
 * - Creates the `routes` table if it doesn't exist.
 * - Adds necessary columns (geom, generated cache columns) idempotently.
 * - Creates configures custom PL/pgSQL functions (e.g., `calculate_route_grades`).
 * - Sets up GIN and GIST indexes for performance.
 */
export async function initDb() {
  try {
    await queryClient`CREATE EXTENSION IF NOT EXISTS postgis;`;
  } catch (e) {
    console.error('Error creating postgis extension:', e);
  }

  // Create table if not exists
  await queryClient`
    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      source_url TEXT UNIQUE NOT NULL,
      title TEXT,
      gpx_content TEXT,
      tags TEXT[],
      is_completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_ascent REAL,
      total_descent REAL
    );
  `;

  // Add is_completed column if not exists (for migration)
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
    `;
  } catch (e) {
    console.log('Column is_completed likely exists or error adding it', e);
  }

  // Add geometry column if not exists
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS geom GEOMETRY(LineStringZ, 4326);
    `;
  } catch (e) {
    console.log('Column geom likely exists or error adding it', e);
  }

  // Add cached GeoJSON column (generated from geom)
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS geojson_cache JSONB
      GENERATED ALWAYS AS (ST_AsGeoJSON(geom)::jsonb) STORED;
    `;
  } catch (e) {
    console.log('Column geojson_cache likely exists or error adding it', e);
  }

  // Add cached distance column (generated from geom)
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_meters REAL
      GENERATED ALWAYS AS (ST_Length(geom::geography)) STORED;
    `;
  } catch (e) {
    console.log('Column distance_meters likely exists or error adding it', e);
  }

  // Add cached bbox column (generated from geom)
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS bbox_cache JSONB
      GENERATED ALWAYS AS (ST_AsGeoJSON(ST_BoundingDiagonal(geom))::jsonb) STORED;
    `;
  } catch (e) {
    console.log('Column bbox_cache likely exists or error adding it', e);
  }

  // Add grades column if not exists
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS grades REAL[];
    `;
  } catch (e) {
    console.log('Column grades likely exists or error adding it', e);
  }

  // Create calculate_route_grades function
  try {
    await queryClient`
      CREATE OR REPLACE FUNCTION calculate_route_grades(geom geometry) RETURNS real[] AS $$
      DECLARE
          num_points integer;
          i integer;
          p1 geometry;
          p2 geometry;
          dist float;
          ele_diff float;
          grade float;
          grades real[] := '{}';
      BEGIN
          IF geom IS NULL THEN
              RETURN grades;
          END IF;

          num_points := ST_NumPoints(geom);
          IF num_points < 2 THEN
              RETURN grades;
          END IF;

          FOR i IN 1..num_points-1 LOOP
              p1 := ST_PointN(geom, i);
              p2 := ST_PointN(geom, i+1);

              -- Calculate distance in meters (using geography for accuracy)
              dist := ST_Distance(p1::geography, p2::geography);

              -- Elevation difference in meters
              ele_diff := ST_Z(p2) - ST_Z(p1);

              IF dist > 0 THEN
                  grade := (ele_diff / dist) * 100;
              ELSE
                  grade := 0;
              END IF;

              grades := array_append(grades, grade::real);
          END LOOP;

          RETURN grades;
      END;
      $$ LANGUAGE plpgsql;
    `;
  } catch (e) {
    console.error('Error creating calculate_route_grades function:', e);
  }

  // Add valhalla_segments column if not exists
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS valhalla_segments JSONB;
    `;
  } catch (e) {
    console.log('Column valhalla_segments likely exists or error adding it', e);
  }

  // Create indexes for query optimization
  try {
    // Index for title text search (case-insensitive regex)
    await queryClient`
      CREATE INDEX IF NOT EXISTS idx_routes_title_text_pattern
      ON routes USING btree (lower(title) text_pattern_ops);
    `;

    // Index for source_url pattern matching (domain filtering)
    await queryClient`
      CREATE INDEX IF NOT EXISTS idx_routes_source_url_pattern
      ON routes USING btree (source_url text_pattern_ops);
    `;

    // Index for sorting by title (case-insensitive)
    await queryClient`
      CREATE INDEX IF NOT EXISTS idx_routes_title_lower
      ON routes (lower(title) DESC);
    `;

    // GIN index for tags array operations (containment queries)
    await queryClient`
      CREATE INDEX IF NOT EXISTS idx_routes_tags_gin
      ON routes USING gin (tags);
    `;

    // Spatial index for geometry (distance calculations)
    await queryClient`
      CREATE INDEX IF NOT EXISTS idx_routes_geom_gist
      ON routes USING gist (geom);
    `;

    console.log('Database indexes created successfully');
  } catch (e) {
    console.error('Error creating indexes:', e);
  }
}
