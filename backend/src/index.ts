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

// Admin panel UIs (open in browser while backend runs)
const panelsRoot = path.join(__dirname, '../..');
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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Factory Alert API is running',
    database: hasDatabase() ? (dbOk ? 'connected' : 'error') : 'in-memory',
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

  app.listen(PORT, () => {
    console.log(`\n🚨 Factory Alert API running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /super-admin/login          — Your login`);
    console.log(`  POST /super-admin/companies       — Create a company`);
    console.log(`  GET  /super-admin/companies       — List all companies`);
    console.log(`  POST /company-admin/login         — Company admin login`);
    console.log(`  GET  /company-admin/dashboard     — Company dashboard`);
    console.log(`  POST /workers/join                — Worker joins`);
    console.log(`  POST /workers/alert               — Trigger alert`);
    console.log(`\nAdmin Panels (open in browser):`);
    console.log(`  http://localhost:${PORT}/panels/super-admin/`);
    console.log(`  http://localhost:${PORT}/panels/company-admin/`);
    console.log(`\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
