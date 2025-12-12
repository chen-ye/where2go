import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { db, initDb } from './db.js';
import { JSDOM } from 'jsdom';
import toGeoJSON from '@mapbox/togeojson';
import type { LineString, MultiLineString } from 'geojson';
import { routes } from './schema.js';
import { eq, sql, and, type SQL } from 'drizzle-orm';
import { getRouteAttributes, type ValhallaSegment } from './valhalla.ts';
import {
  API_PARAM_SEARCH_REGEX,
  API_PARAM_SOURCES,
  API_PARAM_TAGS,
  API_PARAM_MIN_DISTANCE,
  API_PARAM_MAX_DISTANCE,
} from 'where2go-shared/api-constants.ts';

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

// Helper to parse GPX to GeoJSON LineString
function gpxToGeoJSON(gpxContent: string): LineString | null {
  try {
    const dom = new JSDOM(gpxContent, { contentType: 'text/xml' });
    const doc = dom.window.document;

    if (!doc) {
      console.error('Failed to parse XML');
      return null;
    }

    // Convert GPX to GeoJSON using @mapbox/togeojson
    const geoJSON = toGeoJSON.gpx(doc);

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
async function processRouteGPX(
  gpxContent: string,
): Promise<{
  geojson: LineString;
  totalAscent: number;
  totalDescent: number;
  valhallaSegments: ValhallaSegment[] | null;
} | null> {
  const geojson = gpxToGeoJSON(gpxContent);
  if (!geojson) {
    return null;
  }

  const elevationStats = calculateElevationStats(geojson.coordinates);
  const valhallaSegments = await getRouteAttributes(geojson.coordinates);

  return {
    geojson,
    totalAscent: elevationStats.totalAscent,
    totalDescent: elevationStats.totalDescent,
    valhallaSegments,
  };
}

// Helper to build SQL filters from search params
function getRouteFilters(searchParams: URLSearchParams): SQL[] {
  const filters: SQL[] = [];
  const searchRegex = searchParams.get(API_PARAM_SEARCH_REGEX);
  if (searchRegex) {
    filters.push(sql`${routes.title} ~* ${searchRegex}`);
  }

  const sourcesParam = searchParams.get(API_PARAM_SOURCES);
  if (sourcesParam) {
    const sources = sourcesParam.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (sources.length > 0) {
      const domainsPattern = sources.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      filters.push(sql`${routes.sourceUrl} ~* ${`^https?://(www\\.)?(${domainsPattern})`}`);
    }
  }

  const tagsParam = searchParams.get(API_PARAM_TAGS);
  if (tagsParam) {
    const tags = tagsParam.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (tags.length > 0) {
      filters.push(sql`${routes.tags} @> ${tags}`);
    }
  }

  const minDistanceParam = searchParams.get(API_PARAM_MIN_DISTANCE);
  const maxDistanceParam = searchParams.get(API_PARAM_MAX_DISTANCE);
  if (minDistanceParam || maxDistanceParam) {
    const minDistance = minDistanceParam ? parseFloat(minDistanceParam) : 0;
    const maxDistance = maxDistanceParam ? parseFloat(maxDistanceParam) : Number.MAX_SAFE_INTEGER;
    filters.push(
      sql`ST_Length(${routes.geom}::geography) >= ${minDistance} AND ST_Length(${routes.geom}::geography) <= ${maxDistance}`
    );
  }

  return filters;
}

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

router.get('/api/tags', async (ctx) => {
  const result = await db.execute(
    sql`SELECT DISTINCT unnest(${routes.tags}) as tag FROM ${routes} ORDER BY tag`
  );

  const tags = result.map((row) => row.tag).filter((tag) => tag !== null);
  ctx.body = tags;
});

router.post('/api/routes', async (ctx) => {
  const { source_url, gpx_content, title, tags } = ctx.request.body as any;

  if (!source_url || !gpx_content) {
    ctx.status = 400;
    ctx.body = { error: 'Missing source_url or gpx_content' };
    return;
  }

  const processed = await processRouteGPX(gpx_content);
  if (!processed) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid GPX content' };
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
        grades: sql`calculate_route_grades(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326))`,
        totalAscent: processed.totalAscent,
        totalDescent: processed.totalDescent,
        valhallaSegments: processed.valhallaSegments,
        distanceMeters: sql`ST_Length(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)::geography)`,
      })
      .onConflictDoUpdate({
        target: routes.sourceUrl,
        set: {
          title: sql`EXCLUDED.title`,
          gpxContent: sql`EXCLUDED.gpx_content`,
          tags: sql`EXCLUDED.tags`,
          geom: sql`EXCLUDED.geom`,
          grades: sql`calculate_route_grades(EXCLUDED.geom)`,
          totalAscent: sql`EXCLUDED.total_ascent`,
          totalDescent: sql`EXCLUDED.total_descent`,
          valhallaSegments: sql`EXCLUDED.valhalla_segments`,
          distanceMeters: sql`ST_Length(EXCLUDED.geom::geography)`,
          createdAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    ctx.status = 200;
    ctx.body = { success: true };
  } catch (e) {
    console.error(e);
    ctx.status = 500;
    ctx.body = { error: (e as Error).message };
  }
});

router.delete('/api/routes/:id', async (ctx) => {
  const id = ctx.params.id;
  await db.delete(routes).where(eq(routes.id, parseInt(id)));
  ctx.status = 200;
  ctx.body = { success: true };
});

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

    const processed = await processRouteGPX(gpx_content);

    if (!processed) {
      ctx.status = 400;
      ctx.body = { error: 'Failed to process GPX content' };
      return;
    }

    const geojsonStr = JSON.stringify(processed.geojson);

    // Update the route with recomputed values
    // Using sql directly to call the function on the geometry we are setting
    const geomSql = sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`;

    await db
      .update(routes)
      .set({
        geom: geomSql,
        grades: sql`calculate_route_grades(${geomSql})`,
        totalAscent: processed.totalAscent,
        totalDescent: processed.totalDescent,
        valhallaSegments: processed.valhallaSegments,
        distanceMeters: sql`ST_Length(${geomSql}::geography)`,
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

        const processed = await processRouteGPX(row.gpx_content);

        if (!processed) {
          console.error(`Failed to process GPX for route ${row.id}`);
          errorCount++;
          continue;
        }

        const geojsonStr = JSON.stringify(processed.geojson);
        const geomSql = sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`;

        await db
          .update(routes)
          .set({
            geom: geomSql,
            grades: sql`calculate_route_grades(${geomSql})`,
            totalAscent: processed.totalAscent,
            totalDescent: processed.totalDescent,
            valhallaSegments: processed.valhallaSegments,
            distanceMeters: sql`ST_Length(${geomSql}::geography)`,
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
