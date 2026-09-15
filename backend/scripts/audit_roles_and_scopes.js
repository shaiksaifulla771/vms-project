require('dotenv').config();
const mongoose = require('mongoose');

async function auditRoles() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vms_db');
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const distinctRoles = await User.distinct('role');
  const totalUsers = await User.countDocuments();
  const usersByRole = {};

  for (const r of distinctRoles) {
    usersByRole[r] = await User.countDocuments({ role: r });
  }

  console.log('=== REAL DB ROLE AUDIT ===');
  console.log('Total users:', totalUsers);
  console.log('Distinct roles in DB:', distinctRoles);
  console.log('Users per role breakdown:', JSON.stringify(usersByRole, null, 2));

  const allUsersWithDetails = await User.find().select('_id username email role accountStatus siteIds warehouseIds').lean();
  console.log('\n=== ALL USER RECORDS (SAMPLE) ===');
  allUsersWithDetails.forEach(u => {
    console.log(`ID: ${u._id} | User: ${u.username.padEnd(20)} | Email: ${u.email.padEnd(30)} | Role: ${(u.role || '').padEnd(18)} | Status: ${u.accountStatus} | Sites: ${(u.siteIds || []).length} | Warehouses: ${(u.warehouseIds || []).length}`);
  });

  await mongoose.disconnect();
}

auditRoles().catch(err => {
  console.error(err);
  process.exit(1);
});
