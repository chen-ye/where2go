import { Client } from "@db/postgres";

const client = new Client({
  user: Deno.env.get("POSTGRES_USER") || "where2go",
  database: Deno.env.get("POSTGRES_DB") || "where2go",
  hostname: Deno.env.get("POSTGRES_HOST") || "localhost",
  password: Deno.env.get("POSTGRES_PASSWORD") || "password",
  port: parseInt(Deno.env.get("POSTGRES_PORT") || "5432"),
});

export async function initDb() {
  await client.connect();

  // Create table if not exists
  await client.queryArray(`
    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      source_url TEXT UNIQUE NOT NULL,
      title TEXT,
      gpx_content TEXT,
      tags TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if geom column exists, if not add it
  // This is a bit of a hack to ensure postgis extension is enabled and column exists
  // but for a startup script it's okay.
  // Ideally we enable postgis first.

  try {
    await client.queryArray(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  } catch (e) {
    console.error("Error creating postgis extension:", e);
  }

  // Add geometry column if not exists
  try {
     await client.queryArray(`
        ALTER TABLE routes ADD COLUMN IF NOT EXISTS geom GEOMETRY(LineStringZ, 4326);
     `);
  } catch (e) {
      console.log("Column geom likely exists or error adding it", e);
  }

  // Add elevation stats columns
  try {
     await client.queryArray(`
        ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_ascent REAL;
     `);
     await client.queryArray(`
        ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_descent REAL;
     `);
  } catch (e) {
      console.log("Elevation columns likely exist or error adding them", e);
  }
}

export { client };
