require('dotenv').config();
const mongoose = require('mongoose');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vms_db');
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const users = await User.find({
    $or: [
      { siteIds: { $exists: true, $not: { $size: 0 } } },
      { warehouseIds: { $exists: true, $not: { $size: 0 } } }
    ]
  }).select('_id username email role siteIds warehouseIds accountStatus').lean();

  console.log('=== REAL DB SCHEMA AUDIT: USERS WITH SCOPES ===');
  console.log('Total scoped users found:', users.length);
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
