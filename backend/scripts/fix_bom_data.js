const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms-db';
const BOM = require('../models/BOM');

async function fixData() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    
    // Find documents without bomNumber
    const invalidBoms = await BOM.find({ bomNumber: { $exists: false } });
    console.log(`Found ${invalidBoms.length} BOMs without bomNumber.`);
    
    // Delete them since they are corrupt test data
    if (invalidBoms.length > 0) {
      await BOM.deleteMany({ bomNumber: { $exists: false } });
      console.log('Deleted corrupt BOMs.');
    }
    
    await BOM.syncIndexes();
    console.log('Indexes synced.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}
fixData();
