import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Koa from 'koa';
import Router from '@koa/router';
import { processRouteGPX } from '../route-helpers.ts';
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

    // Check existing (Smart Ingestion mock)
    const existingIndex = routes.findIndex(r => r.source_url === source_url);
    if (existingIndex >= 0) {
        // Update tags
        const existing = routes[existingIndex];
        const newTags = tags || [];
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...newTags]));
        const gpxChanged = existing.gpx_content !== gpx_content; // mock implementation usually doesn't store gpx_content in list, but let's assume it does or is irrelevant for list

        routes[existingIndex] = {
            ...existing,
            title: title || existing.title,
            tags: mergedTags,
        };
        ctx.status = 200;
        ctx.body = { success: true, updated: true, gpxChanged };
        return;
    }

    const newRoute = {
      id: routes.length + 1000, // ensure simplified ID
      source_url,
      title: title || 'Untitled Route',
      tags: tags || [],
      is_completed: false,
      created_at: new Date().toISOString(),
      total_ascent: 0,
      total_descent: 0,
      bbox: null,
      distance: 0,
      gpx_content: gpx_content // store for recheck
    };

    routes.push(newRoute as any);
    ctx.status = 200; // Real API returns 200
    ctx.body = { success: true, created: true };
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
    ctx.status = 200; // Real API returns 200 (Mock expected 204 originally but main.ts says 200)
    ctx.body = { success: true };
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
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app.callback()).get('/api/routes/999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
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

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('created', true);
    });

    it('should require source_url and gpx_content', async () => {
      const response = await request(app.callback())
        .post('/api/routes')
        .send({ title: 'Incomplete Route' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should update existing route if source_url matches (Smart Ingest)', async () => {
        // Create first
        const routeData = {
            source_url: 'https://example.com/smart',
            gpx_content: '<gpx version="1.0">A</gpx>',
            tags: ['initial']
        };
        await request(app.callback()).post('/api/routes').send(routeData);

        // Send again with new tags
        const updateResponse = await request(app.callback()).post('/api/routes').send({
            ...routeData,
            tags: ['new-tag']
        });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.updated).toBe(true);
        expect(updateResponse.body.gpxChanged).toBe(false);

        // Verify tags merged
        const list = await request(app.callback()).get('/api/routes');
        const route = list.body.find((r: any) => r.source_url === 'https://example.com/smart');
        expect(route.tags).toContain('initial');
        expect(route.tags).toContain('new-tag');
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
          title: 'Delete Me',
          gpx_content: '<gpx>...</gpx>',
        });

      expect(createResponse.status).toBe(200);

      // We need to fetch it to get the ID because POST doesn't return it anymore
      const listResponse = await request(app.callback()).get('/api/routes');
      const createdRoute = listResponse.body.find((r: any) => r.source_url === 'https://example.com/delete-me');

      expect(createdRoute).toBeDefined();
      const routeId = createdRoute.id;

      // Then delete it
      const deleteResponse = await request(app.callback())
        .delete(`/api/routes/${routeId}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

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
