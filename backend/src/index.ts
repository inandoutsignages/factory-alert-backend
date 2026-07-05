import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { initDatabase, checkDatabaseHealth } from './db/init';
import { hasDatabase } from './db/pool';
import superAdminRoutes from './routes/superAdmin';
import companyAdminRoutes from './routes/companyAdmin';
import workerRoutes from './routes/workers';
import { UPLOADS_ROOT, ensureUploadDirs } from './utils/evacuationFiles';

ensureUploadDirs();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Uploaded evacuation plan files (PDF, images, etc.)
app.use('/uploads', express.static(UPLOADS_ROOT));

// Request logger (helpful during development)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/super-admin', superAdminRoutes);
app.use('/company-admin', companyAdminRoutes);
app.use('/workers', workerRoutes);

// Admin panel UIs (bundled under backend/panels for Railway deploy)
const panelsRoot = path.join(__dirname, '../panels');
app.use('/panels/super-admin', express.static(path.join(panelsRoot, 'super-admin')));
app.use('/panels/company-admin', express.static(path.join(panelsRoot, 'company-admin')));
app.get('/panels', (_req, res) => {
  res.json({
    super_admin: '/panels/super-admin/',
    company_admin: '/panels/company-admin/',
  });
});

// Health check
app.get('/health', async (_req, res) => {
  const dbOk = await checkDatabaseHealth();
  const firebaseOk = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Factory Alert API is running',
    database: hasDatabase() ? (dbOk ? 'connected' : 'error') : 'in-memory',
    push_notifications: firebaseOk ? 'firebase_configured' : 'firebase_missing',
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initDatabase();

  const firebaseOk = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  const dbMode = hasDatabase() ? 'supabase' : 'in-memory';

  app.listen(PORT, () => {
    console.log('');
    console.log('Factory Alert API started successfully');
    console.log(`  Port:      ${PORT}`);
    console.log(`  Database:  ${dbMode}`);
    console.log(`  Firebase:  ${firebaseOk ? 'configured (push notifications enabled)' : 'MISSING — set FIREBASE_* env vars on Render'}`);
    console.log(`  Password:  ${process.env.MASTER_PASSWORD ? 'set' : 'MISSING'}`);
    console.log('');
    console.log('Key endpoints:');
    console.log('  GET  /health');
    console.log('  POST /workers/join');
    console.log('  POST /workers/alert');
    console.log('');
    console.log('Admin panels:');
    console.log(`  /panels/super-admin/`);
    console.log(`  /panels/company-admin/`);
    console.log('');
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
