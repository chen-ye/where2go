import { gpx } from '@tmcw/togeojson';
import { type SQL, sql } from 'drizzle-orm';
import type { LineString, MultiLineString } from 'geojson';
import { JSDOM } from 'jsdom';
import {
  API_PARAM_MAX_DISTANCE,
  API_PARAM_MIN_DISTANCE,
  API_PARAM_SEARCH_REGEX,
  API_PARAM_SOURCES,
  API_PARAM_TAGS,
} from 'where2go-shared/api-constants.ts';
import { routes } from './schema.ts';
import { getRouteAttributes, type ValhallaSegment } from './valhalla.ts';

/**
 * Parses GPX XML content string into a GeoJSON LineString.
 * Uses JSDOM to parse the XML string and @mapbox/togeojson to convert it.
 * Extracts the first LineString or MultiLineString found.
 *
 * @param gpxContent - The raw GPX XML string.
 * @returns The first LineString found geometry, or null if parsing fails or no suitable geometry exists.
 */
export function gpxToGeoJSON(gpxContent: string): LineString | null {
  try {
    const dom = new JSDOM(gpxContent, { contentType: 'text/xml' });
    const doc = dom.window.document;

    if (!doc) {
      console.error('Failed to parse XML');
      return null;
    }

    // Convert GPX to GeoJSON using @tmcw/togeojson
    const geoJSON = gpx(doc);

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

/**
 * Calculates total ascent and total descent from an array of coordinates with elevation data.
 * Elevation is expected to be the third element in each coordinate array [lon, lat, ele].
 *
 * @param coordinates - Array of [lon, lat, ele] coordinate arrays.
 * @returns Object containing totalAscent and totalDescent in meters.
 */
export function calculateElevationStats(coordinates: number[][]): {
  totalAscent: number;
  totalDescent: number;
} {
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

/**
 * Processes GPX content to extract GeoJSON, calculate elevation stats, and optionally fetch Valhalla route attributes.
 *
 * @param gpxContent - The raw GPX XML string.
 * @param useValhalla - If true, fetches data from the Valhalla API (default: true).
 * @returns Object containing computed route data (geojson, ascent/descent, valhallaSegments), or null if processing fails.
 */
export async function processRouteGPX(
  gpxContent: string,
  useValhalla = true,
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

  let valhallaSegments: ValhallaSegment[] | null = null;
  if (useValhalla) {
    valhallaSegments = await getRouteAttributes(geojson.coordinates);
  }

  return {
    geojson,
    totalAscent: elevationStats.totalAscent,
    totalDescent: elevationStats.totalDescent,
    valhallaSegments,
  };
}

/**
 * Formats processed route data into SQL-ready values for database insertion or update.
 * Handles GeoJSON parsing for PostGIS and avoids writing to generated columns.
 *
 * @param processed - The object returned by processRouteGPX.
 * @returns Object with keys corresponding to database columns (geom, grades, totalAscent, etc.).
 */
export function getComputedRouteValues(
  processed: NonNullable<Awaited<ReturnType<typeof processRouteGPX>>>,
) {
  const geojsonStr = JSON.stringify(processed.geojson);
  const geomSql = sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)`;

  return {
    geom: geomSql,
    grades: sql`calculate_route_grades(${geomSql})`,
    totalAscent: processed.totalAscent,
    totalDescent: processed.totalDescent,
    valhallaSegments: processed.valhallaSegments ? processed.valhallaSegments : sql`NULL`,
    // distanceMeters is generated, do not write to it
  };
}

/**
 * Constructs SQL `WHERE` clause filters based on URL query parameters.
 * Supports filtering by regex search title, source URL domains, tags, and distance range.
 *
 * @param searchParams - The URLSearchParams object from the request query.
 * @returns Array of SQL conditions to be ANDed together.
 */
export function getRouteFilters(searchParams: URLSearchParams): SQL[] {
  const filters: SQL[] = [];
  const searchRegex = searchParams.get(API_PARAM_SEARCH_REGEX);
  if (searchRegex) {
    filters.push(sql`${routes.title} ~* ${searchRegex}`);
  }

  const sourcesParam = searchParams.get(API_PARAM_SOURCES);
  if (sourcesParam) {
    const sources = sourcesParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sources.length > 0) {
      const domainsPattern = sources.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      filters.push(sql`${routes.sourceUrl} ~* ${`^https?://(www\\.)?(${domainsPattern})`}`);
    }
  }

  const tagsParam = searchParams.get(API_PARAM_TAGS);
  if (tagsParam) {
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
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
      sql`ST_Length(${routes.geom}::geography) >= ${minDistance} AND ST_Length(${routes.geom}::geography) <= ${maxDistance}`,
    );
  }

  return filters;
}
