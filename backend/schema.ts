import { geometry, real, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';

export const routes = pgTable('routes', {
  id: serial('id').primaryKey(),
  sourceUrl: text('source_url').unique().notNull(),
  title: text('title'),
  gpxContent: text('gpx_content'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at').defaultNow(),
  totalAscent: real('total_ascent'),
  totalDescent: real('total_descent'),
  // PostGIS geometry column - LineStringZ with SRID 4326
  geom: geometry('geom', { type: 'linestring', mode: 'xy', srid: 4326 }),
});

export type Route = typeof routes.$inferSelect;
export type NewRoute = typeof routes.$inferInsert;
