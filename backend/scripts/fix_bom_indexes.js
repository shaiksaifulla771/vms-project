const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vms-db';

async function fixIndexes() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB.');
    const db = mongoose.connection.db;
    const collection = db.collection('boms');
    
    // Check existing indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    // Drop bomNumber_1 if it exists
    if (indexes.find(i => i.name === 'bomNumber_1')) {
      console.log('Dropping bomNumber_1...');
      await collection.dropIndex('bomNumber_1');
      console.log('Dropped.');
    }

    // Drop components.mpnId_1 if it exists
    if (indexes.find(i => i.name === 'components.mpnId_1')) {
      console.log('Dropping components.mpnId_1...');
      await collection.dropIndex('components.mpnId_1');
      console.log('Dropped.');
    }

    // Force Mongoose to sync indexes based on the updated schema
    console.log('Syncing indexes from Mongoose schema...');
    const BOM = require('../models/BOM');
    await BOM.syncIndexes();
    console.log('Sync complete.');

    const newIndexes = await collection.indexes();
    console.log('New indexes:', newIndexes.map(i => i.name));

  } catch (err) {
    console.error('Error fixing indexes:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixIndexes();
