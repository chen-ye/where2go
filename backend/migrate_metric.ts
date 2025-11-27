
import { Client } from "@db/postgres";

const client = new Client({
  user: Deno.env.get("POSTGRES_USER") || "where2go",
  database: Deno.env.get("POSTGRES_DB") || "where2go",
  hostname: Deno.env.get("POSTGRES_HOST") || "localhost",
  password: Deno.env.get("POSTGRES_PASSWORD") || "password",
  port: parseInt(Deno.env.get("POSTGRES_PORT") || "5432"),
});

await client.connect();

console.log("Migrating routes to metric...");
try {
  await client.queryArray(`
    UPDATE routes
    SET total_ascent = total_ascent * 0.3048,
        total_descent = total_descent * 0.3048
  `);
  console.log("Migration complete.");
} catch (e) {
  console.error("Migration failed:", e);
} finally {
  await client.end();
}
