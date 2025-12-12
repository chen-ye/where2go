import cors from '@koa/cors';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { initDb } from './db.ts';
import { startBackgroundJob } from './jobs/background-processor.ts';
import router from './routes.ts';

const app = new Koa();

// Middleware
app.use(cors({ origin: '*' }));
app.use(
  bodyParser({
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb',
  }),
);

// Error Handling Middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.status = 500;
    ctx.body = { msg: (err as Error).message };
  }
});

// Routes
app.use(router.routes());
app.use(router.allowedMethods());

// Database Connection & Server Start
async function startServer() {
  console.log('Connecting to DB...');
  // Retry logic for DB connection
  let connected = false;
  while (!connected) {
    try {
      await initDb();
      connected = true;
      console.log('Connected to DB');
    } catch (e) {
      console.log('Failed to connect to DB, retrying in 5s...', (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Start background job
  startBackgroundJob();

  console.log('Server running on http://localhost:8070');
  app.listen(8070, '0.0.0.0');
}

startServer();
