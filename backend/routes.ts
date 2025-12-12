import Router from '@koa/router';
import * as metadataController from './controllers/metadata-controller.ts';
import * as routeController from './controllers/route-controller.ts';

const router = new Router();

// Metadata Endpoints
router.get('/api/sources', metadataController.getSources);
router.get('/api/tags', metadataController.getTags);

// Route Endpoints
router.get('/api/routes', routeController.listRoutes);
router.post('/api/routes', routeController.createRoute);
router.get('/api/routes/:id', routeController.getRoute);
router.put('/api/routes/:id', routeController.updateRoute);
router.delete('/api/routes/:id', routeController.deleteRoute);
router.get('/api/routes/:id/download', routeController.downloadRoute);
router.post('/api/routes/:id/recompute', routeController.recomputeRoute);
router.post('/api/routes/recompute', routeController.recomputeAllRoutes);

// Tiles
router.get('/api/routes/tiles/:z/:x/:y', routeController.getTiles);

export default router;
