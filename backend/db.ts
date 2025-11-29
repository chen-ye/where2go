import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

const connectionString = 'postgres://username:password@host:1234/database';

// Create postgres connection
const queryClient = postgres(connectionString, {
  host: Deno.env.get('POSTGRES_HOST') || 'localhost',
  port: parseInt(Deno.env.get('POSTGRES_PORT') || '5432'),
  username: Deno.env.get('POSTGRES_USER') || 'where2go',
  password: Deno.env.get('POSTGRES_PASSWORD') || 'password',
  database: Deno.env.get('POSTGRES_DB') || 'where2go',
});

// Create drizzle instance
export const db = drizzle(queryClient, { schema });

export async function initDb() {
  // Check if PostGIS extension exists, if not add it
  try {
    await queryClient`CREATE EXTENSION IF NOT EXISTS postgis;`;
  } catch (e) {
    console.error('Error creating postgis extension:', e);
  }

  // Create table if not exists - using  raw SQL since Drizzle migrations
  // are more complex for simple cases
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
