const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const BOM = require('./models/BOM');
const MPN = require('./models/MPN');
const Material = require('./models/Material');
const Vendor = require('./models/Vendor');
const bomRoutes = require('./routes/bomRoutes');
const errorHandler = require('./middleware/errorHandler');

jest.mock('./backend/middleware/authMiddleware', () => ({ protect: (req, res, next) => { req.user = { id: 'mock' }; next(); } })); const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { id: 'mock', name: 'Tester' }; next(); });
app.use('/api/boms', bomRoutes);
app.use(errorHandler);

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test');
  await BOM.deleteMany({});
  await MPN.deleteMany({});
  await Material.deleteMany({});
  await Vendor.deleteMany({});

  const fg = await Material.create({ name: 'FG', code: 'FG-1', type: 'Finished', unit: 'pcs' });
  const raw = await Material.create({ name: 'Raw', code: 'RAW-1', type: 'Raw Material', unit: 'kg' });
  const vendor = await Vendor.create({ name: 'Vendor', category: 'Raw Material', email: 'test@example.com' });
  const mpn = await MPN.create({ mpnCode: 'MPN1', materialId: raw._id, vendorId: vendor._id, manufacturerName: 'Mfg', manufacturerPartNumber: 'PN1', price: 100 });

  const payload = {
    productId: fg._id.toString(),
    batchSize: 10,
    batchUOM: 'kg',
    effectiveDate: new Date().toISOString(),
    components: [
      {
        mpnId: mpn._id.toString(),
        qty: 1,
        lossPercent: 1
      }
    ]
  };

  const res = await request(app).post('/api/boms').send(payload);
  console.log('Response Status:', res.status);
  console.log('Response Body:', res.body);

  await mongoose.disconnect();
}

test();
