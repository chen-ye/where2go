import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import fs from 'fs';
import path from 'path';

const testRoutePath = path.join(__dirname, '../../shared/testdata/routes/772.json');
const testRoute = JSON.parse(fs.readFileSync(testRoutePath, 'utf-8'));


// Mock app for testing (simplified version of main.ts)
const createTestApp = () => {
  const app = new Koa();
  const router = new Router();

  app.use(cors({ origin: '*' }));
  app.use(bodyParser());

  // Health check endpoint
  router.get('/health', (ctx) => {
    ctx.body = { status: 'ok' };
  });

  // Mock routes endpoint that returns test data
  router.get('/api/routes', (ctx) => {
    ctx.body = [testRoute];
  });

  // Mock individual route endpoint
  router.get('/api/routes/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    if (id === testRoute.id) {
      ctx.body = testRoute;
    } else {
      ctx.status = 404;
      ctx.body = { error: 'Route not found' };
    }
  });

  app.use(router.routes());
  return app;
};

describe('API Tests', () => {
  let app: Koa;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const response = await request(app.callback()).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Routes API', () => {
    it('should return list of routes', async () => {
      const response = await request(app.callback()).get('/api/routes');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('geojson');
    });

    it('should return a single route by id', async () => {
      const response = await request(app.callback()).get(`/api/routes/${testRoute.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testRoute.id);
      expect(response.body).toHaveProperty('title', testRoute.title);
      expect(response.body).toHaveProperty('source_url', testRoute.source_url);
      expect(response.body).toHaveProperty('is_completed', testRoute.is_completed);
      expect(response.body).toHaveProperty('tags');
      expect(Array.isArray(response.body.tags)).toBe(true);
      expect(response.body.geojson).toHaveProperty('type', 'LineString');
      expect(Array.isArray(response.body.geojson.coordinates)).toBe(true);
      expect(response.body.geojson.coordinates.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback()).get('/api/routes/999999');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should have correct geojson structure', async () => {
      const response = await request(app.callback()).get(`/api/routes/${testRoute.id}`);
      const { geojson } = response.body;

      expect(geojson.type).toBe('LineString');
      expect(geojson.coordinates[0]).toHaveLength(3); // [lon, lat, elevation]
      expect(typeof geojson.coordinates[0][0]).toBe('number'); // longitude
      expect(typeof geojson.coordinates[0][1]).toBe('number'); // latitude
      expect(typeof geojson.coordinates[0][2]).toBe('number'); // elevation
    });
  });
});
