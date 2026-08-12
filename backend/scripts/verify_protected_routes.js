const request = require('supertest');
const app = require('../app');

const routesToTest = [
  { path: '/api/materials', method: 'get' },
  { path: '/api/inventory', method: 'get' },
  { path: '/api/productions', method: 'get' },
  { path: '/api/purchases', method: 'get' },
  { path: '/api/boms', method: 'get' },
  { path: '/api/vendors', method: 'get' },
  { path: '/api/vendor-masters', method: 'get' },
  { path: '/api/admin/users', method: 'get' },
  { path: '/api/users', method: 'get' },
  { path: '/api/sites', method: 'get' },
  { path: '/api/warehouses', method: 'get' },
  { path: '/api/mpns', method: 'get' },
  { path: '/api/mrp/runs', method: 'get' },
  { path: '/api/production-plans', method: 'get' },
  { path: '/api/quality', method: 'get' },
  { path: '/api/qc', method: 'get' },
  { path: '/api/reports', method: 'get' },
  { path: '/api/approvals', method: 'get' },
  { path: '/api/audit', method: 'get' },
  { path: '/api/transfers', method: 'get' },
  { path: '/api/visitors', method: 'get' },
  { path: '/api/appointments', method: 'get' },
  { path: '/api/contracts', method: 'get' },
  { path: '/api/requests', method: 'get' },
  { path: '/api/performance', method: 'get' },
  { path: '/api/chat', method: 'get' }
];

async function verifyAllProtectedRoutes() {
  console.log('--- VERIFYING GLOBAL PROTECTED ROUTE COVERAGE ---');
  let passedCount = 0;
  let failedCount = 0;

  for (const route of routesToTest) {
    const res = await request(app)[route.method](route.path);
    
    // Expect 401 Unauthorized because no Authorization Bearer header is present
    if (res.status === 401 && res.body.success === false) {
      console.log(`[PASS] ${route.method.toUpperCase()} ${route.path} -> 401 Unauthorized (${res.body.error})`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${route.method.toUpperCase()} ${route.path} -> Bypassed protection! Status: ${res.status}`);
      failedCount++;
    }
  }

  console.log('--------------------------------------------------');
  console.log(`Summary: ${passedCount}/${routesToTest.length} routes strictly protected by Firebase Auth middleware.`);
  
  if (failedCount > 0) {
    throw new Error(`CRITICAL: ${failedCount} route(s) bypassed authentication middleware!`);
  }
}

verifyAllProtectedRoutes().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
