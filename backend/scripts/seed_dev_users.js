// Quick seed script that sends HTTP requests to the running backend to create dev users
const http = require('http');

const BACKEND = 'http://localhost:5000';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BACKEND);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function seedUsers() {
  console.log('=== Seeding VMS Development Users ===\n');

  const users = [
    { username: 'System Admin', email: 'admin@vms.com', password: 'Admin123456!', role: 'Admin', requestedRole: 'Admin' },
    { username: 'Inventory Manager', email: 'inventory@vms.com', password: 'Manager123!', role: 'Inventory Manager', requestedRole: 'Inventory Manager' },
    { username: 'Production Manager', email: 'production@vms.com', password: 'Manager123!', role: 'Production Manager', requestedRole: 'Production Manager' },
  ];

  for (const user of users) {
    try {
      // Use register-sync with email in body (no Firebase token needed)
      const res = await post('/api/auth/register-sync', {
        username: user.username,
        email: user.email,
        requestedRole: user.requestedRole
      });
      console.log(`[${res.status}] ${user.email}: ${res.data?.message || JSON.stringify(res.data).slice(0, 100)}`);
    } catch (err) {
      console.error(`FAILED ${user.email}: ${err.message}`);
    }
  }

  console.log('\n=== Seed Complete ===');
  console.log('\nDevelopment Login Credentials:');
  console.log('─────────────────────────────────────');
  console.log('1. Admin:    admin@vms.com');
  console.log('2. Inv Mgr:  inventory@vms.com');
  console.log('3. Prod Mgr: production@vms.com');
  console.log('─────────────────────────────────────');
  console.log('\nUse Google Sign-In or the register-sync endpoint.');
  console.log('These accounts are auto-approved with ACTIVE status.\n');
}

seedUsers();
