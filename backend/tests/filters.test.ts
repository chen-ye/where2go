import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import fs from 'fs';
import path from 'path';

const routesListPath = path.join(__dirname, '../../shared/testdata/routes-list.json');
const routesList = JSON.parse(fs.readFileSync(routesListPath, 'utf-8'));

const sourcesPath = path.join(__dirname, '../../shared/testdata/sources.json');
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

const tagsPath = path.join(__dirname, '../../shared/testdata/tags.json');
const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'));

// Mock app for testing filter endpoints
const createTestApp = () => {
  const app = new Koa();
  const router = new Router();

  app.use(cors({ origin: '*' }));
  app.use(bodyParser());

  const routes = routesList;

  // Routes list with filtering
  router.get('/api/routes', (ctx) => {
    const { q, sources, tags, min_distance, max_distance } = ctx.query;
    let filteredRoutes = [...routes];

    // Regex search filter
    if (q) {
      const regex = new RegExp(q as string, 'i');
      filteredRoutes = filteredRoutes.filter((r) => regex.test(r.title || ''));
    }

    // Sources filter
    if (sources) {
      const sourceList = (sources as string).split(',');
      filteredRoutes = filteredRoutes.filter((r) =>
        sourceList.some((s) => r.source_url?.includes(s))
      );
    }

    // Tags filter
    if (tags) {
      const tagList = (tags as string).split(',');
      filteredRoutes = filteredRoutes.filter((r) =>
        r.tags && tagList.every((t) => r.tags.includes(t))
      );
    }

    // Distance filter
    if (min_distance || max_distance) {
      const min = min_distance ? parseFloat(min_distance as string) : 0;
      const max = max_distance ? parseFloat(max_distance as string) : Infinity;
      filteredRoutes = filteredRoutes.filter(
        (r) => r.distance && r.distance >= min && r.distance <= max
      );
    }

    ctx.body = filteredRoutes;
  });

  // Sources endpoint
  router.get('/api/sources', (ctx) => {
    const sources = new Set<string>();
    routes.forEach((r: any) => {
      if (r.source_url) {
        const match = r.source_url.match(/https?:\/\/(?:www\.)?([^/]+)/);
        if (match) sources.add(match[1]);
      }
    });
    ctx.body = Array.from(sources).sort();
  });

  // Tags endpoint
  router.get('/api/tags', (ctx) => {
    const tags = new Set<string>();
    routes.forEach((r: any) => {
      if (r.tags) r.tags.forEach((t: string) => tags.add(t));
    });
    ctx.body = Array.from(tags).sort();
  });

  app.use(router.routes());
  return app;
};

describe('Routes API - Filtering', () => {
  let app: Koa;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Search Filter', () => {
    it('should filter routes by title regex', async () => {
      const response = await request(app.callback())
        .get('/api/routes?q=chilly');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // All results should match the query
      response.body.forEach((route: any) => {
        expect(route.title.toLowerCase()).toContain('chilly');
      });
    });

    it('should be case-insensitive', async () => {
      const response = await request(app.callback())
        .get('/api/routes?q=DIRTY');

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app.callback())
        .get('/api/routes?q=xyznonexistent');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('Sources Filter', () => {
    it('should filter routes by source domain', async () => {
      const response = await request(app.callback())
        .get('/api/routes?sources=ridewithgps.com');

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.source_url).toContain('ridewithgps.com');
      });
    });

    it('should support multiple sources', async () => {
      const response = await request(app.callback())
        .get('/api/routes?sources=ridewithgps.com,strava.com');

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        const matchesAny = route.source_url.includes('ridewithgps.com') ||
          route.source_url.includes('strava.com');
        expect(matchesAny).toBe(true);
      });
    });
  });

  describe('Tags Filter', () => {
    it('should filter routes by single tag', async () => {
      const response = await request(app.callback())
        .get('/api/routes?tags=collection');

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.tags).toContain('collection');
      });
    });

    it('should filter routes by multiple tags (AND logic)', async () => {
      const response = await request(app.callback())
        .get('/api/routes?tags=imported,collection');

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.tags).toContain('imported');
        expect(route.tags).toContain('collection');
      });
    });
  });

  describe('Distance Filter', () => {
    it('should filter routes by minimum distance', async () => {
      const minDistance = 50000; // 50km in meters
      const response = await request(app.callback())
        .get(`/api/routes?min_distance=${minDistance}`);

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.distance).toBeGreaterThanOrEqual(minDistance);
      });
    });

    it('should filter routes by maximum distance', async () => {
      const maxDistance = 100000; // 100km in meters
      const response = await request(app.callback())
        .get(`/api/routes?max_distance=${maxDistance}`);

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.distance).toBeLessThanOrEqual(maxDistance);
      });
    });

    it('should filter routes by distance range', async () => {
      const minDistance = 50000;
      const maxDistance = 100000;
      const response = await request(app.callback())
        .get(`/api/routes?min_distance=${minDistance}&max_distance=${maxDistance}`);

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.distance).toBeGreaterThanOrEqual(minDistance);
        expect(route.distance).toBeLessThanOrEqual(maxDistance);
      });
    });
  });

  describe('Combined Filters', () => {
    it('should apply multiple filters together', async () => {
      const response = await request(app.callback())
        .get('/api/routes?q=dirty&tags=collection&min_distance=50000');

      expect(response.status).toBe(200);
      response.body.forEach((route: any) => {
        expect(route.title.toLowerCase()).toContain('dirty');
        expect(route.tags).toContain('collection');
        expect(route.distance).toBeGreaterThanOrEqual(50000);
      });
    });
  });

  describe('GET /api/sources', () => {
    it('should return list of unique sources', async () => {
      const response = await request(app.callback()).get('/api/sources');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // Should be sorted
      const sorted = [...response.body].sort();
      expect(response.body).toEqual(sorted);
    });

    it('should extract domain names from URLs', async () => {
      const response = await request(app.callback()).get('/api/sources');

      response.body.forEach((source: string) => {
        // Should not include protocol or www
        expect(source).not.toMatch(/^https?:\/\//);
        expect(source).not.toMatch(/^www\./);
      });
    });
  });

  describe('GET /api/tags', () => {
    it('should return list of unique tags', async () => {
      const response = await request(app.callback()).get('/api/tags');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should be sorted alphabetically', async () => {
      const response = await request(app.callback()).get('/api/tags');

      const sorted = [...response.body].sort();
      expect(response.body).toEqual(sorted);
    });
  });
});
