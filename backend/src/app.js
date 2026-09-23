const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { actingUser, scope, writeGuard } = require('./middleware/session');
const { AppError, fromPg } = require('./utils/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(compression());
  app.use(cors({
    origin: (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map((s) => s.trim()),
    allowedHeaders: ['Content-Type', 'X-User-Id', 'X-Location-Id', 'X-Warehouse-Id'],
    exposedHeaders: ['Content-Disposition'],
  }));
  app.use('/api/bulk', express.json({ limit: '10mb' })); // uploaded spreadsheets
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api', actingUser, scope, writeGuard);

  app.use('/api/session', require('./routes/session'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/locations', require('./routes/locations'));
  app.use('/api/warehouses', require('./routes/warehouses'));
  app.use('/api/vendors', require('./routes/vendors'));
  app.use('/api/materials', require('./routes/materials'));
  app.use('/api/categories', require('./routes/categories'));
  app.use('/api/bulk', require('./routes/bulk'));
  app.use('/api/mpns', require('./routes/mpns'));
  app.use('/api/boms', require('./routes/boms'));
  app.use('/api/inventory', require('./routes/inventory'));
  app.use('/api/transfers', require('./routes/transfers'));
  app.use('/api/plans', require('./routes/plans'));
  app.use('/api/batches', require('./routes/batches'));
  app.use('/api/reports', require('./routes/reports'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const mapped = err instanceof AppError ? err : fromPg(err);
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.message, details: mapped.details });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error('[api] unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
