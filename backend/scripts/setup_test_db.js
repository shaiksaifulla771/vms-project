const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('../config/db');
const User = require('../models/User');

dotenv.config();

async function setupTestDB() {
  if (process.env.NODE_ENV !== 'test') {
    console.error('FATAL ERROR: setup_test_db.js must be run with NODE_ENV=test');
    process.exit(1);
  }

  try {
    await connectDB();
    
    // Explicitly drop the test database to ensure a clean slate
    await mongoose.connection.db.dropDatabase();
    console.log('Test database wiped clean.');

    // Seed the required Admin user
    await User.create({
      username: 'System Admin',
      email: 'admin@vms.com',
      password: 'admin123',
      role: 'Admin',
      isVerified: true,
      accountStatus: 'Active'
    });
    console.log('Seeded Admin: admin@vms.com');

    console.log('Test database setup complete.');
    process.exit(0);
  } catch (err) {
    console.error(`Test Database setup failed: ${err.message}`);
    process.exit(1);
  }
}

setupTestDB();
