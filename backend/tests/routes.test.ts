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


// Mock app for testing routes endpoints
const createTestApp = () => {
  const app = new Koa();
  const router = new Router();

  app.use(cors({ origin: '*' }));
  app.use(bodyParser());

  //Mock routes storage
  let routes = [testRoute];

  // List routes
  router.get('/api/routes', (ctx) => {
    ctx.body = routes;
  });

  // Get single route
  router.get('/api/routes/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const route = routes.find((r) => r.id === id);
    if (route) {
      ctx.body = route;
    } else {
      ctx.status = 404;
      ctx.body = { error: 'Route not found' };
    }
  });

  // Create route
  router.post('/api/routes', (ctx) => {
    const { source_url, title, tags, gpx_content } = ctx.request.body as any;

    if (!source_url || !gpx_content) {
      ctx.status = 400;
      ctx.body = { error: 'Missing source_url or gpx_content' };
      return;
    }

    const newRoute = {
      id: routes.length + 1,
      source_url,
      title: title || 'Untitled Route',
      tags: tags || [],
      is_completed: false,
      created_at: new Date().toISOString(),
      total_ascent: 0,
      total_descent: 0,
      bbox: null,
      distance: 0,
    };

    routes.push(newRoute as any);
    ctx.status = 201;
    ctx.body = newRoute;
  });

  // Update route
  router.put('/api/routes/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const routeIndex = routes.findIndex((r) => r.id === id);

    if (routeIndex === -1) {
      ctx.status = 404;
      ctx.body = { error: 'Route not found' };
      return;
    }

    const updates = ctx.request.body as any;
    routes[routeIndex] = { ...routes[routeIndex], ...updates };
    ctx.body = routes[routeIndex];
  });

  // Delete route
  router.delete('/api/routes/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const routeIndex = routes.findIndex((r) => r.id === id);

    if (routeIndex === -1) {
      ctx.status = 404;
      ctx.body = { error: 'Route not found' };
      return;
    }

    routes.splice(routeIndex, 1);
    ctx.status = 204;
  });

  app.use(router.routes());
  return app;
};

describe('Routes API - CRUD Operations', () => {
  let app: Koa;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET /api/routes', () => {
    it('should return list of routes', async () => {
      const response = await request(app.callback()).get('/api/routes');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should return routes with required fields', async () => {
      const response = await request(app.callback()).get('/api/routes');
      const route = response.body[0];

      expect(route).toHaveProperty('id');
      expect(route).toHaveProperty('title');
      expect(route).toHaveProperty('source_url');
      expect(route).toHaveProperty('tags');
      expect(route).toHaveProperty('is_completed');
    });
  });

  describe('GET /api/routes/:id', () => {
    it('should return a single route with full details', async () => {
      const response = await request(app.callback()).get(`/api/routes/${testRoute.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testRoute.id);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('geojson');
      expect(response.body.geojson).toHaveProperty('type', 'LineString');
      expect(Array.isArray(response.body.geojson.coordinates)).toBe(true);
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback()).get('/api/routes/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should have valid GeoJSON structure', async () => {
      const response = await request(app.callback()).get(`/api/routes/${testRoute.id}`);
      const { geojson } = response.body;

      expect(geojson.type).toBe('LineString');
      expect(geojson.coordinates[0]).toHaveLength(3); // [lon, lat, elevation]
      expect(typeof geojson.coordinates[0][0]).toBe('number');
      expect(typeof geojson.coordinates[0][1]).toBe('number');
      expect(typeof geojson.coordinates[0][2]).toBe('number');
    });
  });

  describe('POST /api/routes', () => {
    it('should create a new route', async () => {
      const newRoute = {
        source_url: 'https://example.com/route/123',
        title: 'Test Route',
        tags: ['test', 'new'],
        gpx_content: '<gpx>...</gpx>', // Mock GPX
      };

      const response = await request(app.callback())
        .post('/api/routes')
        .send(newRoute);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title', 'Test Route');
      expect(response.body.tags).toEqual(['test', 'new']);
    });

    it('should require source_url and gpx_content', async () => {
      const response = await request(app.callback())
        .post('/api/routes')
        .send({ title: 'Incomplete Route' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should use default title if not provided', async () => {
      const response = await request(app.callback())
        .post('/api/routes')
        .send({
          source_url: 'https://example.com/route/456',
          gpx_content: '<gpx>...</gpx>',
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Untitled Route');
    });
  });

  describe('PUT /api/routes/:id', () => {
    it('should update route fields', async () => {
      const updates = {
        title: 'Updated Title',
        is_completed: true,
        tags: ['updated'],
      };

      const response = await request(app.callback())
        .put(`/api/routes/${testRoute.id}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Title');
      expect(response.body.is_completed).toBe(true);
      expect(response.body.tags).toEqual(['updated']);
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback())
        .put('/api/routes/999999')
        .send({ title: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/routes/:id', () => {
    it('should delete a route', async () => {
      // First create a route to delete
      const createResponse = await request(app.callback())
        .post('/api/routes')
        .send({
          source_url: 'https://example.com/delete-me',
          gpx_content: '<gpx>...</gpx>',
        });

      const routeId = createResponse.body.id;

      // Then delete it
      const deleteResponse = await request(app.callback())
        .delete(`/api/routes/${routeId}`);

      expect(deleteResponse.status).toBe(204);

      // Verify it's gone
      const getResponse = await request(app.callback())
        .get(`/api/routes/${routeId}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback())
        .delete('/api/routes/999999');

      expect(response.status).toBe(404);
    });
  });
});
