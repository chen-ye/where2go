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

  // Check if PostGIS extension exists, if not add it
  try {
    await queryClient`CREATE EXTENSION IF NOT EXISTS postgis;`;
  } catch (e) {
    console.error('Error creating postgis extension:', e);
  }

  // Add geometry column if not exists
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS geom GEOMETRY(LineStringZ, 4326);
    `;
  } catch (e) {
    console.log('Column geom likely exists or error adding it', e);
  }

  // Add valhalla_segments column if not exists
  try {
    await queryClient`
      ALTER TABLE routes ADD COLUMN IF NOT EXISTS valhalla_segments JSONB;
    `;
  } catch (e) {
    console.log('Column valhalla_segments likely exists or error adding it', e);
  }
}
