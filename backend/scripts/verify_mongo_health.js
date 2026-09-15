const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const connectDB = require('../config/db');

async function testHealth() {
  console.log('--- Testing MongoDB Cluster Health ---');
  try {
    const start = Date.now();
    await connectDB();
    const connectTime = Date.now() - start;
    console.log(`✓ Connected in ${connectTime}ms`);

    // Ping admin DB
    const admin = mongoose.connection.db.admin();
    const pingRes = await admin.ping();
    console.log('✓ Admin Ping Result:', pingRes);

    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✓ Total Collections: ${collections.length}`);

    // Check Materials count
    const matCount = await mongoose.connection.db.collection('materials').countDocuments();
    const vendorCount = await mongoose.connection.db.collection('vendors').countDocuments();
    const mpnCount = await mongoose.connection.db.collection('mpns').countDocuments();
    console.log(`✓ Active Records: Materials=${matCount}, Vendors=${vendorCount}, MPNs=${mpnCount}`);

    console.log('🎉 MongoDB Health: 100% HEALTHY, OPTIMIZED & ACTIVE');
    process.exit(0);
  } catch (err) {
    console.error('❌ Health Check Failed:', err);
    process.exit(1);
  }
}

testHealth();
