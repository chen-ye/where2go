import { boolean, geometry, jsonb, real, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { pgTable, customType } from 'drizzle-orm/pg-core';

// Define a custom type for real array since 'real[]' isn't directly supported in drizzle-orm/pg-core yet or needs specific handling
// Actually, drizzle has .array() support for some types, but real[] might be tricky.
// Let's check Drizzle docs or standard usage.
// Drizzle supports array(real) using `real("grades").array()`.

export const routes = pgTable('routes', {
  id: serial('id').primaryKey(),
  sourceUrl: text('source_url').unique().notNull(),
  title: text('title'),
  gpxContent: text('gpx_content'),
  tags: text('tags').array(),
  isCompleted: boolean('is_completed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  totalAscent: real('total_ascent'),
  totalDescent: real('total_descent'),
  valhallaSegments: jsonb('valhalla_segments'),
  // PostGIS geometry column - LineStringZ with SRID 4326
  geom: geometry('geom', { type: 'linestring', mode: 'xy', srid: 4326 }),
  grades: real('grades').array(),
  // Cached/generated columns for performance
  geojsonCache: jsonb('geojson_cache'),
  distanceMeters: real('distance_meters'),
  bboxCache: jsonb('bbox_cache'),
});

export type Route = typeof routes.$inferSelect;
export type NewRoute = typeof routes.$inferInsert;
