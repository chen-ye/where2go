import { Application, Router, oakCors, RouterContext } from "./deps.ts";
import { initDb, client } from "./db.ts";
import { parse } from "./deps.ts";
import { Route, RouteRow, GPXParseResult, TrkPt, GeoJSONLineString } from "./types.ts";

const app = new Application();
app.use(oakCors({ origin: "*" })); // Enable CORS for all routes

const router = new Router();

// Helper to parse GPX to GeoJSON LineString
function gpxToGeoJSON(gpxContent: string): GeoJSONLineString | null {
  try {
    const xml = parse(gpxContent) as unknown as GPXParseResult;
    // This is a naive parsing assuming standard GPX structure
    // <gpx> <trk> <trkseg> <trkpt lat="" lon=""> ...

    let trk = xml.gpx?.trk;
    if (!trk) return null;

    // trk could be array or object
    if (Array.isArray(trk)) trk = trk[0];

    let trkseg = trk.trkseg;
    if (!trkseg) return null;
    if (Array.isArray(trkseg)) trkseg = trkseg[0];

    const trkpts = trkseg.trkpt;
    if (!trkpts || !Array.isArray(trkpts)) return null;

    const coordinates = trkpts.map((pt: TrkPt) => {
        return [parseFloat(pt["@lon"]), parseFloat(pt["@lat"])];
    });

    return {
      type: "LineString",
      coordinates: coordinates
    };
  } catch (e) {
    console.error("Error parsing GPX", e);
    return null;
  }
}

// Routes
router.get("/api/routes", async (ctx: RouterContext<string>) => {
  const result = await client.queryObject<RouteRow>(`
    SELECT
      id,
      source_url,
      title,
      tags,
      created_at,
      ST_AsGeoJSON(geom) as geojson
    FROM routes
    ORDER BY created_at DESC
  `);

  const routes = result.rows.map((row) => ({
    ...row,
    geojson: JSON.parse(row.geojson ?? '[]')
  }));

  ctx.response.body = routes;
});

router.post("/api/routes", async (ctx: RouterContext<string>) => {
  const body = ctx.request.body();
  if (body.type !== "json") {
    ctx.response.status = 400;
    return;
  }
  const { source_url, gpx_content, title, tags } = await body.value;

  if (!source_url || !gpx_content) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing source_url or gpx_content" };
    return;
  }

  const geojson = gpxToGeoJSON(gpx_content);
  if (!geojson) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid GPX content" };
    return;
  }

  const geojsonStr = JSON.stringify(geojson);

  try {
    await client.queryArray(`
      INSERT INTO routes (source_url, title, gpx_content, tags, geom)
      VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
      ON CONFLICT (source_url)
      DO UPDATE SET
        title = EXCLUDED.title,
        gpx_content = EXCLUDED.gpx_content,
        tags = EXCLUDED.tags,
        geom = EXCLUDED.geom,
        created_at = CURRENT_TIMESTAMP
    `, [source_url, title || "Untitled Route", gpx_content, tags || [], geojsonStr]);

    ctx.response.status = 200;
    ctx.response.body = { success: true };
  } catch (e) {
    console.error(e);
    ctx.response.status = 500;
    ctx.response.body = { error: (e as Error).message };
  }
});

router.delete("/api/routes/:id", async (ctx: RouterContext<string>) => {
    const id = ctx.params.id;
    await client.queryArray("DELETE FROM routes WHERE id = $1", [id]);
    ctx.response.status = 200;
    ctx.response.body = { success: true };
});

router.get("/api/routes/:id/download", async (ctx: RouterContext<string>) => {
  const id = ctx.params.id;
  const result = await client.queryObject("SELECT title, gpx_content FROM routes WHERE id = $1", [id]);

  if (result.rows.length === 0) {
      ctx.response.status = 404;
      return;
  }

  const route = result.rows[0] as Route;
  const filename = (route.title || "route").replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".gpx";

  ctx.response.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  ctx.response.headers.set("Content-Type", "application/gpx+xml");
  ctx.response.body = route.gpx_content;
});

router.put("/api/routes/:id", async (ctx: RouterContext<string>) => {
    const id = ctx.params.id;
    const body = ctx.request.body();
    const { tags } = await body.value;

    await client.queryArray("UPDATE routes SET tags = $1 WHERE id = $2", [tags, id]);
    ctx.response.status = 200;
    ctx.response.body = { success: true };
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
      index: "index.html",
    });
  } catch {
    await next();
  }
});


console.log("Connecting to DB...");
// Retry logic for DB connection
let connected = false;
while (!connected) {
    try {
        await initDb();
        connected = true;
        console.log("Connected to DB");
    } catch (e) {
        console.log("Failed to connect to DB, retrying in 5s...", (e as Error).message);
        await new Promise(r => setTimeout(r, 5000));
    }
}

console.log("Server running on http://localhost:8070");
await app.listen({ port: 8070, hostname: "0.0.0.0" });
