const { execSync } = require('child_process');
const mongoose = require('mongoose');

async function run() {
  try {
    console.log('Dropping vms_ci_test...');
    await mongoose.connect('mongodb://127.0.0.1:27017/vms_ci_test');
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
    
    console.log('Starting server...');
    const serverProcess = require('child_process').spawn('node', ['server.js'], {
      env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27017/vms_ci_test', PORT: '5000', NODE_ENV: 'test' },
      stdio: 'ignore',
      detached: true
    });
    serverProcess.unref();

    console.log('Waiting 5s for server to start...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('Running seed_admin.js...');
    execSync('node scripts/seed_admin.js', { env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27017/vms_ci_test' }, stdio: 'inherit' });

    console.log('Running npm test...');
    execSync('npm test', { env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27017/vms_ci_test' }, stdio: 'inherit' });

    console.log('Tests finished successfully. Killing server...');
    process.kill(-serverProcess.pid);
  } catch (err) {
    console.error('Test suite failed:', err.message);
    process.exit(1);
  }
}
run();
