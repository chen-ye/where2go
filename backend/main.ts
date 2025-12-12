import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { db, initDb } from './db.js';
import {
  gpxToGeoJSON,
  calculateElevationStats,
  processRouteGPX,
  getComputedRouteValues,
  getRouteFilters,
} from './route-helpers.js';

import { routes } from './schema.js';
import { eq, sql, and, type SQL } from 'drizzle-orm';

const app = new Koa();
const router = new Router();

app.use(cors({ origin: '*' }));
app.use(
  bodyParser({
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb',
  })
);



/**
 * GET /api/routes/tiles/:z/:x/:y
 * Serves Mapbox Vector Tiles (MVT) for routes.
 * Query params are used to filter routes included in the tile.
 * Caches tiles for 1 hour.
 */
// MVT Tile Endpoint
router.get('/api/routes/tiles/:z/:x/:y', async (ctx) => {
  const { z, x, y } = ctx.params;
  const filters = getRouteFilters(new URLSearchParams(ctx.querystring));

  // Calculate tile envelope
  // ST_TileEnvelope(z, x, y)
  const envelope = sql`ST_TileEnvelope(${parseInt(z)}, ${parseInt(x)}, ${parseInt(y)})`;

  // MVT query
  const mvtQuery = db
    .select({
      mvt: sql`ST_AsMVT(tile, 'routes', 4096, 'geom', 'id')`,
    })
    .from(
      sql`
      (
        SELECT
          ${routes.id} as id,
          ${routes.title},
          ${routes.isCompleted},
          ST_AsMVTGeom(
            ST_Transform(ST_Force2D(${routes.geom}), 3857),
            ${envelope},
            4096,
            256,
            true
          ) AS geom
        FROM ${routes}
        WHERE ST_Intersects(${routes.geom}, ST_Transform(${envelope}, 4326))
        ${filters.length > 0 ? sql`AND ${and(...filters)}` : sql``}
      ) AS tile
    `
    );

  const result = await mvtQuery;

  // Cache for 1 hour
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.set('Content-Type', 'application/vnd.mapbox-vector-tile');
  ctx.body = result[0].mvt;
});

/**
 * GET /api/routes
 * Retrieves a list of routes with filtering and sorting.
 * Excludes heavy geometry/segment fields for list performance.
 */
// Optimized List Endpoint
router.get('/api/routes', async (ctx) => {
  const filters = getRouteFilters(new URLSearchParams(ctx.querystring));

  let query = db
    .select({
      id: routes.id,
      source_url: routes.sourceUrl,
      title: routes.title,
      tags: routes.tags,
      is_completed: routes.isCompleted,
      created_at: routes.createdAt,
      total_ascent: routes.totalAscent,
      total_descent: routes.totalDescent,
      bbox: routes.bboxCache,
      distance: routes.distanceMeters,
      // Exclude heavy fields: geojson, valhalla_segments, grades
    })
    .from(routes)
    .$dynamic();

  if (filters.length > 0) {
    query = query.where(and(...filters));
  }

  const result = await query.orderBy(sql`lower(${routes.title}) desc`);
  ctx.body = result;
});

/**
 * GET /api/sources
 * Returns a list of unique source domains from existing routes.
 */
router.get('/api/sources', async (ctx) => {
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
});

/**
 * GET /api/tags
 * Returns a list of unique tags from existing routes.
 */
router.get('/api/tags', async (ctx) => {
  const result = await db.execute(
    sql`SELECT DISTINCT unnest(${routes.tags}) as tag FROM ${routes} ORDER BY tag`
  );

  const tags = result.map((row) => row.tag).filter((tag) => tag !== null);
  ctx.body = tags;
});

/**
 * POST /api/routes
 * Ingests a new route or updates an existing one (Smart Ingestion).
 * - Checks source_url for duplications.
 * - Detects GPX changes to optionally skip expensive reprocessing.
 * - Merges tags.
 * - Skips synchronous Valhalla processing (deferring to background job if needed).
 */
router.post('/api/routes', async (ctx) => {
  const { source_url, gpx_content, title, tags } = ctx.request.body as any;

  if (!source_url || !gpx_content) {
    ctx.status = 400;
    ctx.body = { error: 'Missing source_url or gpx_content' };
    return;
  }

  // Skip Valhalla processing on ingest to avoid rate limits
  const processed = await processRouteGPX(gpx_content, true);
  if (!processed) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid GPX content' };
    return;
  }

  try {
    // Check if route exists
    const existingRoute = await db
      .select({
        id: routes.id,
        gpxContent: routes.gpxContent,
        tags: routes.tags,
      })
      .from(routes)
      .where(eq(routes.sourceUrl, source_url))
      .limit(1);

    const newTags = tags || [];
    let mergedTags = newTags;

    if (existingRoute.length > 0) {
      const existing = existingRoute[0];
      // Merge tags
      const uniqueTags = new Set([...(existing.tags || []), ...newTags]);
      mergedTags = Array.from(uniqueTags);

      const gpxChanged = existing.gpxContent !== gpx_content;

      if (gpxChanged) {
        // GPX changed: Full update (recompute geometry, reset Valhalla)
        const computedValues = getComputedRouteValues(processed);
        await db
          .update(routes)
          .set({
            title: title || 'Untitled Route', // Update title if provided
            gpxContent: gpx_content,
            tags: mergedTags,
            ...computedValues
          })
          .where(eq(routes.id, existing.id));
      } else {
         // GPX same: partial update (tags only, maybe title)
         await db
           .update(routes)
           .set({
             title: title || 'Untitled Route',
             tags: mergedTags,
             // Do NOT update geometry or reset Valhalla segments
           })
           .where(eq(routes.id, existing.id));
      }
      ctx.body = { success: true, updated: true, gpxChanged };
    } else {
      // New route: Insert
      const computedValues = getComputedRouteValues(processed);
      const values: any = {
          sourceUrl: source_url,
          title: title || 'Untitled Route',
          gpxContent: gpx_content,
          tags: mergedTags,
          ...computedValues
      };

      await db.insert(routes).values(values);
      ctx.body = { success: true, created: true };
    }

    ctx.status = 200;
  } catch (e) {
    console.error(e);
    ctx.status = 500;
    ctx.body = { error: (e as Error).message };
  }
});



/**
 * DELETE /api/routes/:id
 * Deletes a route by ID.
 */
router.delete('/api/routes/:id', async (ctx) => {
  const id = ctx.params.id;
  await db.delete(routes).where(eq(routes.id, parseInt(id)));
  ctx.status = 200;
  ctx.body = { success: true };
});

/**
 * GET /api/routes/:id/download
 * Downloads the GPX content for a specific route as a file attachment.
 */
router.get('/api/routes/:id/download', async (ctx) => {
  const id = ctx.params.id;
  const result = await db
    .select({
      title: routes.title,
      gpx_content: routes.gpxContent,
    })
    .from(routes)
    .where(eq(routes.id, parseInt(id)))
    .limit(1);

  if (result.length === 0) {
    ctx.status = 404;
    return;
  }

  const route = result[0];
  const filename = (route.title || 'route').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.gpx';

  ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
  ctx.set('Content-Type', 'application/gpx+xml');
  ctx.body = route.gpx_content;
});

/**
 * GET /api/routes/:id
 * Retrieves full details for a single route, including heavy geometry/segment fields.
 */
router.get('/api/routes/:id', async (ctx) => {
  const id = ctx.params.id;
  const result = await db
    .select({
      id: routes.id,
      source_url: routes.sourceUrl,
      title: routes.title,
      tags: routes.tags,
      is_completed: routes.isCompleted,
      created_at: routes.createdAt,
      geojson: routes.geojsonCache,
      distance: routes.distanceMeters,
      total_ascent: routes.totalAscent,
      total_descent: routes.totalDescent,
      valhalla_segments: routes.valhallaSegments,
      grades: routes.grades,
      bbox: routes.bboxCache,
    })
    .from(routes)
    .where(eq(routes.id, parseInt(id)));

  if (result.length === 0) {
    ctx.status = 404;
    return;
  }

  ctx.status = 200;
  ctx.body = result[0];
});

/**
 * PUT /api/routes/:id
 * Updates metadata (tags, completion status) for a route.
 * Does NOT update GPX content or geometry.
 */
router.put('/api/routes/:id', async (ctx) => {
  const id = ctx.params.id;
  const { tags, is_completed } = ctx.request.body as any;

  const updateData: Partial<typeof routes.$inferInsert> = {};
  if (tags !== undefined) updateData.tags = tags;
  if (is_completed !== undefined) updateData.isCompleted = is_completed;

  await db
    .update(routes)
    .set(updateData)
    .where(eq(routes.id, parseInt(id)));

  const result = await db
    .select({
      id: routes.id,
      source_url: routes.sourceUrl,
      title: routes.title,
      tags: routes.tags,
      is_completed: routes.isCompleted,
      created_at: routes.createdAt,
      geojson: routes.geojsonCache,
      distance: routes.distanceMeters,
      total_ascent: routes.totalAscent,
      total_descent: routes.totalDescent,
      valhalla_segments: routes.valhallaSegments,
      grades: routes.grades,
      bbox: routes.bboxCache,
    })
    .from(routes)
    .where(eq(routes.id, parseInt(id)));

  if (result.length === 0) {
    ctx.status = 404;
    return;
  }

  ctx.status = 200;
  ctx.body = result[0];
});

/**
 * POST /api/routes/:id/recompute
 * Manually forces a full recompute of route statistics and geometry provided by Valhalla.
 * This is a synchronous operation and may be slow.
 */
// Recompute stats for a single route
router.post('/api/routes/:id/recompute', async (ctx) => {
  const id = ctx.params.id;

  try {
    // Fetch the route's GPX content
    const result = await db
      .select({ gpx_content: routes.gpxContent })
      .from(routes)
      .where(eq(routes.id, parseInt(id)))
      .limit(1);

    if (result.length === 0) {
      ctx.status = 404;
      ctx.body = { error: 'Route not found' };
      return;
    }

    const gpx_content = result[0].gpx_content;
    if (!gpx_content) {
      ctx.status = 400;
      ctx.body = { error: 'No GPX content found' };
      return;
    }

    // Force Valhalla processing on manual recompute
    const processed = await processRouteGPX(gpx_content, false);

    if (!processed) {
      ctx.status = 400;
      ctx.body = { error: 'Failed to process GPX content' };
      return;
    }

    const computedValues = getComputedRouteValues(processed);

    await db
      .update(routes)
      .set({
        geom: computedValues.geom,
        grades: computedValues.grades,
        totalAscent: computedValues.totalAscent,
        totalDescent: computedValues.totalDescent,
        valhallaSegments: computedValues.valhallaSegments,
      })
      .where(eq(routes.id, parseInt(id)));

    ctx.status = 200;
    ctx.body = { success: true };
  } catch (e) {
    console.error(e);
    ctx.status = 500;
    ctx.body = { error: (e as Error).message };
  }
});

/**
 * POST /api/routes/recompute
 * Bulk recomputes statistics for all routes.
 * Skips Valhalla processing to avoid API rate limits, updating only local geometry/elevation stats.
 */
// Recompute stats for all routes
router.post('/api/routes/recompute', async (ctx) => {
  try {
    // Fetch all routes with their GPX content
    const allRoutes = await db
      .select({ id: routes.id, gpx_content: routes.gpxContent })
      .from(routes);

    let successCount = 0;
    let errorCount = 0;

    for (const row of allRoutes) {
      try {
        if (!row.gpx_content) {
          errorCount++;
          continue;
        }

        // Skip Valhalla for bulk recompute to avoid rate limits
        const processed = await processRouteGPX(row.gpx_content, true);

        if (!processed) {
          console.error(`Failed to process GPX for route ${row.id}`);
          errorCount++;
          continue;
        }

        const computedValues = getComputedRouteValues(processed);

        await db
          .update(routes)
          .set({
             geom: computedValues.geom,
             grades: computedValues.grades,
             totalAscent: computedValues.totalAscent,
             totalDescent: computedValues.totalDescent,
          })
          .where(eq(routes.id, row.id));

        successCount++;
      } catch (e) {
        console.error(`Error recomputing route ${row.id}:`, e);
        errorCount++;
      }
    }

    ctx.status = 200;
    ctx.body = {
      success: true,
      successCount,
      errorCount,
      total: allRoutes.length,
    };
  } catch (e) {
    console.error(e);
    ctx.status = 500;
    ctx.body = { error: (e as Error).message };
  }
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = { msg: (err as Error).message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log('Connecting to DB...');
// Retry logic for DB connection
let connected = false;
while (!connected) {
  try {
    await initDb();
    connected = true;
    console.log('Connected to DB');
  } catch (e) {
    console.log('Failed to connect to DB, retrying in 5s...', (e as Error).message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

console.log('Server running on http://localhost:8070');
app.listen(8070, '0.0.0.0');

const DAILY_LIMIT = 10;
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

/**
 * Background job to process routes that are missing Valhalla segments.
 * Runs once at startup and then periodically (configured by DAILY_LIMIT and interval).
 * Queries the database for routes where `valhallaSegments` is NULL, processes them one by one,
 * and updates them with new statistics and segment data.
 * Limited to `DAILY_LIMIT` routes per run to respect API usage policies.
 */
async function processBackgroundQueue() {
  console.log('Running background Valhalla processing...');

  try {
    // Find routes with missing Valhalla segments
    const routesToProcess = await db
      .select({ id: routes.id, gpxContent: routes.gpxContent })
      .from(routes)
      .where(sql`${routes.valhallaSegments} IS NULL`)
      .limit(DAILY_LIMIT);

    if (routesToProcess.length === 0) {
      console.log('No routes pending Valhalla processing.');
      return;
    }

    console.log(`Found ${routesToProcess.length} routes to process.`);

    for (const route of routesToProcess) {
      if (!route.gpxContent) continue;

      try {
        console.log(`Processing route ${route.id} for Valhalla...`);
        // Force valhalla processing
        const processed = await processRouteGPX(route.gpxContent, false);

        if (processed && processed.valhallaSegments) {
           const computedValues = getComputedRouteValues(processed);

           await db
             .update(routes)
             .set({
               geom: computedValues.geom,
               grades: computedValues.grades,
               totalAscent: computedValues.totalAscent,
               totalDescent: computedValues.totalDescent,
               valhallaSegments: computedValues.valhallaSegments,
             })
             .where(eq(routes.id, route.id));

           console.log(`Successfully processed route ${route.id}`);
           // Wait a bit between calls to be nice (e.g. 5 seconds)
           await new Promise(r => setTimeout(r, 5000));
        } else {
            console.warn(`Valhalla returned null for route ${route.id}`);
        }
      } catch (err) {
        console.error(`Error processing route ${route.id}:`, err);
      }
    }
  } catch (e) {
    console.error('Error in background job:', e);
  }
}

// Start immediately after a short delay, then loop 24h
// Note: In development with restarts, this might run often.
// If this becomes an issue, we'd need to store "last_valhalla_run" in DB.
setTimeout(() => {
    processBackgroundQueue();
    setInterval(processBackgroundQueue, 24 * 60 * 60 * 1000);
}, 10000); // 10s delay start
