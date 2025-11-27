import { Application, Router, RouterContext } from '@oak/oak';
import { oakCors } from '@tajpouria/cors';
import { db, initDb } from './db.ts';
import { Document, DOMParser } from '@b-fuze/deno-dom';
import toGeoJSON from '@mapbox/togeojson';
import type { LineString, MultiLineString } from 'geojson';
import { routes } from './schema.ts';
import { desc, eq, sql } from 'drizzle-orm';

const app = new Application();
app.use(oakCors({ origin: '*' })); // Enable CORS for all routes

const router = new Router();

// Helper to parse GPX to GeoJSON LineString
function gpxToGeoJSON(gpxContent: string): LineString | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxContent, 'text/html');

    if (!doc) {
      console.error('Failed to parse XML');
      return null;
    }

    // Convert GPX to GeoJSON using @mapbox/togeojson
    const geoJSON = toGeoJSON.gpx(doc as unknown as Document);

    // Extract the first LineString from the GeoJSON
    // toGeoJSON returns a FeatureCollection
    if (geoJSON.type === 'FeatureCollection' && geoJSON.features.length > 0) {
      for (const feature of geoJSON.features) {
        if (feature.geometry.type === 'LineString') {
          return feature.geometry as LineString;
        }
        // Handle MultiLineString by taking the first line
        if (feature.geometry.type === 'MultiLineString') {
          const coords = (feature.geometry as MultiLineString).coordinates[0];
          return {
            type: 'LineString',
            coordinates: coords,
          };
        }
      }
    }

    console.error('No LineString found in GPX');
    return null;
  } catch (e) {
    console.error('Error parsing GPX', e);
    return null;
  }
}

// Helper to calculate elevation gain/loss from coordinates
function calculateElevationStats(
  coordinates: number[][],
): { totalAscent: number; totalDescent: number } {
  let totalAscent = 0;
  let totalDescent = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prevEle = coordinates[i - 1][2]; // elevation is 3rd coordinate
    const currEle = coordinates[i][2];

    if (prevEle !== undefined && currEle !== undefined) {
      const diff = currEle - prevEle;
      if (diff > 0) {
        totalAscent += diff;
      } else if (diff < 0) {
        totalDescent += Math.abs(diff);
      }
    }
  }

  return {
    totalAscent: totalAscent,
    totalDescent: totalDescent,
  };
}

// Helper to process GPX content and return computed values
function processRouteGPX(
  gpxContent: string,
): { geojson: GeoJSONLineString; totalAscent: number; totalDescent: number } | null {
  const geojson = gpxToGeoJSON(gpxContent);
  if (!geojson) {
    return null;
  }

  const elevationStats = calculateElevationStats(geojson.coordinates);

  return {
    geojson,
    totalAscent: elevationStats.totalAscent,
    totalDescent: elevationStats.totalDescent,
  };
}

// Routes
router.get('/api/routes', async (ctx: RouterContext<string>) => {
  const result = await db
    .select({
      id: routes.id,
      source_url: routes.sourceUrl,
      title: routes.title,
      tags: routes.tags,
      created_at: routes.createdAt,
      geojson: sql<string>`ST_AsGeoJSON(${routes.geom})`,
      distance: sql<number>`ST_Length(${routes.geom}::geography)`,
      total_ascent: routes.totalAscent,
      total_descent: routes.totalDescent,
    })
    .from(routes)
    .orderBy(desc(routes.createdAt));

  const mappedRoutes = result.map((row) => ({
    ...row,
    geojson: JSON.parse(row.geojson ?? '[]'),
    distance: Number(row.distance),
    total_ascent: Number(row.total_ascent),
    total_descent: Number(row.total_descent),
  }));

  ctx.response.body = mappedRoutes;
});

router.post('/api/routes', async (ctx: RouterContext<string>) => {
  const body = ctx.request.body;
  if (body.type() !== 'json') {
    ctx.response.status = 400;
    return;
  }
  const { source_url, gpx_content, title, tags } = await body.json();

  if (!source_url || !gpx_content) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Missing source_url or gpx_content' };
    return;
  }

  const processed = processRouteGPX(gpx_content);
  if (!processed) {
    ctx.response.status = 400;
    ctx.response.body = { error: 'Invalid GPX content' };
    return;
  }

  const geojsonStr = JSON.stringify(processed.geojson);

  try {
    await db
      .insert(routes)
      .values({
        sourceUrl: source_url,
        title: title || 'Untitled Route',
        gpxContent: gpx_content,
        tags: tags || [],
        geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`,
        totalAscent: processed.totalAscent,
        totalDescent: processed.totalDescent,
      })
      .onConflictDoUpdate({
        target: routes.sourceUrl,
        set: {
          title: sql`EXCLUDED.title`,
          gpxContent: sql`EXCLUDED.gpx_content`,
          tags: sql`EXCLUDED.tags`,
          geom: sql`EXCLUDED.geom`,
          totalAscent: sql`EXCLUDED.total_ascent`,
          totalDescent: sql`EXCLUDED.total_descent`,
          createdAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (e) {
    console.error(e);
    ctx.response.status = 500;
    ctx.response.body = { error: (e as Error).message };
  }
});

router.delete('/api/routes/:id', async (ctx: RouterContext<string>) => {
  const id = ctx.params.id;
  await db.delete(routes).where(eq(routes.id, parseInt(id)));
  ctx.response.status = 200;
  ctx.response.body = { success: true };
});

router.get('/api/routes/:id/download', async (ctx: RouterContext<string>) => {
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
    ctx.response.status = 404;
    return;
  }

  const route = result[0];
  const filename = (route.title || 'route').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.gpx';

  ctx.response.headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  ctx.response.headers.set('Content-Type', 'application/gpx+xml');
  ctx.response.body = route.gpx_content;
});

router.put('/api/routes/:id', async (ctx: RouterContext<string>) => {
  const id = ctx.params.id;
  const body = ctx.request.body;
  const { tags } = await body.json();

  await db
    .update(routes)
    .set({ tags })
    .where(eq(routes.id, parseInt(id)));

  ctx.response.status = 200;
  ctx.response.body = { success: true };
});

// Recompute stats for a single route
router.post('/api/routes/:id/recompute', async (ctx: RouterContext<string>) => {
  const id = ctx.params.id;

  try {
    // Fetch the route's GPX content
    const result = await db
      .select({ gpx_content: routes.gpxContent })
      .from(routes)
      .where(eq(routes.id, parseInt(id)))
      .limit(1);

    if (result.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Route not found' };
      return;
    }

    const gpx_content = result[0].gpx_content;
    if (!gpx_content) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'No GPX content found' };
      return;
    }

    const processed = processRouteGPX(gpx_content);

    if (!processed) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Failed to process GPX content' };
      return;
    }

    const geojsonStr = JSON.stringify(processed.geojson);

    // Update the route with recomputed values
    await db
      .update(routes)
      .set({
        geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`,
        totalAscent: processed.totalAscent,
        totalDescent: processed.totalDescent,
      })
      .where(eq(routes.id, parseInt(id)));

    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (e) {
    console.error(e);
    ctx.response.status = 500;
    ctx.response.body = { error: (e as Error).message };
  }
});

// Recompute stats for all routes
router.post('/api/routes/recompute', async (ctx: RouterContext<string>) => {
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

        const processed = processRouteGPX(row.gpx_content);

        if (!processed) {
          console.error(`Failed to process GPX for route ${row.id}`);
          errorCount++;
          continue;
        }

        const geojsonStr = JSON.stringify(processed.geojson);

        await db
          .update(routes)
          .set({
            geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`,
            totalAscent: processed.totalAscent,
            totalDescent: processed.totalDescent,
          })
          .where(eq(routes.id, row.id));

        successCount++;
      } catch (e) {
        console.error(`Error recomputing route ${row.id}:`, e);
        errorCount++;
      }
    }

    ctx.response.status = 200;
    ctx.response.body = {
      success: true,
      successCount,
      errorCount,
      total: allRoutes.length,
    };
  } catch (e) {
    console.error(e);
    ctx.response.status = 500;
    ctx.response.body = { error: (e as Error).message };
  }
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = { msg: (err as Error).message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// Serve static frontend files
app.use(async (ctx, next) => {
  try {
    await ctx.send({
      root: `${Deno.cwd()}/frontend/dist`,
      index: 'index.html',
    });
  } catch {
    await next();
  }
});

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
await app.listen({ port: 8070, hostname: '0.0.0.0' });
