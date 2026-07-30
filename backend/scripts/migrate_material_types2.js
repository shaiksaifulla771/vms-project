const mongoose = require('mongoose');

function normalizeMaterialType(rawType) {
  if (!rawType || typeof rawType !== 'string') return 'Raw Material';
  const clean = rawType.trim().toLowerCase();

  if (clean === 'raw' || clean === 'raw material') {
    return 'Raw Material';
  }
  if (clean === 'packing material' || clean === 'packaging' || clean === 'packaged material' || clean === 'packaged') {
    return 'Packaged Material';
  }
  if (clean === 'semi-finished' || clean === 'semifinished' || clean === 'semi finished') {
    return 'Semi-Finished';
  }
  if (clean === 'finished' || clean === 'finished goods' || clean === 'finished good') {
    return 'Finished';
  }
  return 'Raw Material';
}

async function migrate() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms');
  const db = mongoose.connection.db;

  const existingMats = await db.collection('materials').find({}).toArray();
  let migratedCount = 0;
  for (const m of existingMats) {
    const newType = normalizeMaterialType(m.type);
    if (newType !== m.type) {
      await db.collection('materials').updateOne({ _id: m._id }, { $set: { type: newType } });
      migratedCount++;
    }
  }

  console.log('Migrated', migratedCount, 'material records to canonical types.');

  const updatedMats = await db.collection('materials').find({}).toArray();
  const summary = {};
  updatedMats.forEach(m => {
    summary[m.type] = (summary[m.type] || 0) + 1;
  });
  console.log('Updated distinct material types in DB:', summary);
  await mongoose.disconnect();
}

migrate();
