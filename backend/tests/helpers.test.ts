import { describe, it, expect } from 'vitest';
import {
  gpxToGeoJSON,
  calculateElevationStats,
  processRouteGPX,
  getRouteFilters
} from '../route-helpers.js';
import {
    API_PARAM_SEARCH_REGEX,
    API_PARAM_TAGS
} from 'where2go-shared/api-constants.ts';
import { sql } from 'drizzle-orm';
import { URLSearchParams } from 'url';

describe('Route Helpers', () => {
  describe('gpxToGeoJSON', () => {
    it('should parse valid GPX to GeoJSON LineString', () => {
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Test Route</name>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194">
        <ele>10.0</ele>
      </trkpt>
      <trkpt lat="37.7750" lon="-122.4195">
        <ele>20.0</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;
      const geojson = gpxToGeoJSON(gpx);
      expect(geojson).not.toBeNull();
      expect(geojson?.type).toBe('LineString');
      expect(geojson?.coordinates).toHaveLength(2);
      expect(geojson?.coordinates[0]).toEqual([-122.4194, 37.7749, 10.0]);
    });

    it('should return null for invalid GPX', () => {
      const gpx = '<invalid xml>';
      const geojson = gpxToGeoJSON(gpx);
      expect(geojson).toBeNull();
    });

    it('should return null if no LineString found', () => {
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="37.7749" lon="-122.4194"></wpt>
</gpx>`;
      const geojson = gpxToGeoJSON(gpx);
      expect(geojson).toBeNull();
    });
  });

  describe('calculateElevationStats', () => {
    it('should correctly calculate ascent and descent', () => {
      const coords = [
        [0, 0, 100],
        [0, 0, 110], // +10
        [0, 0, 105], // -5
        [0, 0, 120], // +15
        [0, 0, 120], // 0
      ];
      const stats = calculateElevationStats(coords);
      expect(stats.totalAscent).toBe(25);
      expect(stats.totalDescent).toBe(5);
    });

    it('should handle missing elevation', () => {
      const coords = [
        [0, 0, 100],
        [0, 0], // missing
        [0, 0, 110],
      ];
      const stats = calculateElevationStats(coords);
      expect(stats.totalAscent).toBe(0); // Should skip the gap? logic: if prev & curr defined.
      // 0->1: prev=100, curr=undef -> skip
      // 1->2: prev=undef, curr=110 -> skip
    });
  });

  describe('processRouteGPX', () => {
    it('should process GPX skipping Valhalla', async () => {
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
      <trkpt lat="0" lon="0"><ele>0</ele></trkpt>
      <trkpt lat="1" lon="1"><ele>10</ele></trkpt>
  </trkseg></trk>
</gpx>`;
      const processed = await processRouteGPX(gpx, true);
      expect(processed).not.toBeNull();
      expect(processed?.geojson).toBeDefined();
      expect(processed?.totalAscent).toBe(10);
      expect(processed?.valhallaSegments).toBeNull();
    });
  });

  describe('getRouteFilters', () => {
      it('should return empty array for empty params', () => {
          const params = new URLSearchParams();
          const filters = getRouteFilters(params);
          expect(filters).toHaveLength(0);
      });

      it('should add search filter', () => {
          const params = new URLSearchParams(`${API_PARAM_SEARCH_REGEX}=foobar`);
          const filters = getRouteFilters(params);
          expect(filters).toHaveLength(1);
          // Can't easily inspect SQL object content without mock, but checking length is good sanity check
      });

      it('should add multiple filters', () => {
          const params = new URLSearchParams(`${API_PARAM_SEARCH_REGEX}=foo&${API_PARAM_TAGS}=bar,baz`);
          const filters = getRouteFilters(params);
          expect(filters).toHaveLength(2);
      });
  });
});
