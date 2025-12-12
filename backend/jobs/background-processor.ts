import { db } from '../db.ts';
import { routes } from '../schema.ts';
import { eq, sql } from 'drizzle-orm';
import { processRouteGPX, getComputedRouteValues } from '../route-helpers.ts';

const DAILY_LIMIT = 10;
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

/**
 * Background job to process routes that are missing Valhalla segments.
 * Runs once at startup and then periodically (configured by DAILY_LIMIT and interval).
 * Queries the database for routes where `valhallaSegments` is NULL, processes them one by one,
 * and updates them with new statistics and segment data.
 * Limited to `DAILY_LIMIT` routes per run to respect API usage policies.
 */
export async function processBackgroundQueue() {
  console.log('Running background Valhalla processing...');

  try {
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
        const processed = await processRouteGPX(route.gpxContent, true);

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

/**
 * Initializes the background job scheduler.
 * Sets up a recurring interval to check for tasks in the background queue.
 * Includes a startup delay to allow the application server to fully initialize first.
 */
export function startBackgroundJob() {
    // Note: In development with restarts, this might run often.
    // If this becomes an issue, we'd need to store "last_valhalla_run" in DB.
    setTimeout(() => {
        processBackgroundQueue();
        setInterval(processBackgroundQueue, CHECK_INTERVAL);
    }, 10000); // 10s delay start
}
