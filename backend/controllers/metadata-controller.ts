import type { Context } from 'koa';
import { db } from '../db.ts';
import { routes } from '../schema.ts';
import { sql } from 'drizzle-orm';

/**
 * GET /api/sources
 * Returns a list of unique source domains from existing routes.
 */
export async function getSources(ctx: Context) {
  // Extract unique domains from source_url
  // Using regex to capture the domain part: https?://(www\.)?([^/]+)
  const result = await db.execute(
    sql`
      SELECT DISTINCT
        substring(source_url from 'https?://(?:www\.)?([^/]+)') as source
      FROM ${routes}
      WHERE source_url IS NOT NULL
      ORDER BY source
    `
  );

  const sources = result.map((row) => row.source).filter((source) => source !== null);
  ctx.body = sources;
}

/**
 * GET /api/tags
 * Returns a list of unique tags from existing routes.
 */
export async function getTags(ctx: Context) {
  const result = await db.execute(
    sql`SELECT DISTINCT unnest(${routes.tags}) as tag FROM ${routes} ORDER BY tag`
  );

  const tags = result.map((row) => row.tag).filter((tag) => tag !== null);
  ctx.body = tags;
}
