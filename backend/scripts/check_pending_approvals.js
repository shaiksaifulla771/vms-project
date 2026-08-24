const mongoose = require('mongoose');
require('dotenv').config();

async function inspectPendingApprovals() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  console.log('====================================================');
  console.log('         VMS PENDING APPROVALS AUDIT REPORT         ');
  console.log('====================================================\n');

  // 1. Pending User Registrations
  console.log('--- 1. PENDING USER REGISTRATIONS (Image 2) ---');
  const pendingUsers = await db.collection('users').find({ accountStatus: { $in: ['PENDING', 'Pending'] } }).toArray();
  console.log('Total Pending Users:', pendingUsers.length);
  pendingUsers.forEach(u => {
    console.log(` • User: ${u.username || u.name} | Email: ${u.email} | Requested Role: ${u.requestedRole || u.role} | Registered At: ${u.createdAt}`);
  });

  // 2. Pending Stock Adjustments
  console.log('\n--- 2. PENDING STOCK ADJUSTMENTS (Approvals Hub) ---');
  const pendingAdjustments = await db.collection('stockadjustments').find({ status: { $in: ['PENDING', 'Pending'] } }).toArray();
  console.log('Total Pending Adjustments:', pendingAdjustments.length);
  pendingAdjustments.forEach(a => {
    console.log(` • Adj #: ${a.adjNumber} | Material: ${a.materialId} | Qty: ${a.quantity} | Type: ${a.adjustmentType} | Reason: ${a.reason}`);
  });

  // 3. Pending Stock Transfers
  console.log('\n--- 3. PENDING STOCK TRANSFERS (Approvals Hub) ---');
  const pendingTransfers = await db.collection('stocktransfers').find({ status: { $in: ['PENDING', 'Pending', 'IN_TRANSIT', 'In Transit'] } }).toArray();
  console.log('Total Pending Transfers:', pendingTransfers.length);
  pendingTransfers.forEach(t => {
    console.log(` • Transfer #: ${t.transferNumber} | Material: ${t.materialId} | Qty: ${t.quantity} | Status: ${t.status}`);
  });

  // 4. Pending Appointments / Gate Passes
  console.log('\n--- 4. PENDING VISITOR APPOINTMENTS (Approvals Hub) ---');
  const pendingAppointments = await db.collection('appointments').find({ status: { $in: ['PENDING', 'Pending', 'Scheduled', 'SCHEDULED'] } }).toArray();
  console.log('Total Pending Appointments:', pendingAppointments.length);
  pendingAppointments.forEach(ap => {
    console.log(` • Appt #: ${ap.appointmentNumber || ap._id} | Visitor: ${ap.visitorName || ap.name} | Host: ${ap.hostName} | Status: ${ap.status}`);
  });

  // 5. Pending Purchase Orders & Requisitions
  console.log('\n--- 5. PENDING PROCUREMENT ORDERS & REQUISITIONS ---');
  const pendingPOs = await db.collection('purchaseorders').find({ status: { $in: ['Pending', 'PENDING', 'Draft', 'DRAFT'] } }).toArray();
  const pendingPRs = await db.collection('purchaserequirements').find({ status: { $in: ['OPEN', 'DRAFT', 'PENDING', 'Pending'] } }).toArray();
  console.log(`Total Pending POs: ${pendingPOs.length} | Open PRs: ${pendingPRs.length}`);
  pendingPOs.forEach(po => console.log(` • PO #: ${po.poNumber} | Total: ₹${po.totalAmount} | Status: ${po.status}`));
  pendingPRs.forEach(pr => console.log(` • PR #: ${pr.requirementNumber} | Material: ${pr.materialName} | Qty: ${pr.quantity} | Status: ${pr.status}`));

  // 6. Unscheduled / Pending Production Plans
  console.log('\n--- 6. UNSCHEDULED PRODUCTION PLANS (Scheduling Hub) ---');
  const unscheduledPlans = await db.collection('productionplans').find({ status: { $in: ['UNSCHEDULED', 'Unscheduled', 'DRAFT', 'Draft', 'Pending', 'PENDING'] } }).toArray();
  console.log('Total Unscheduled Plans:', unscheduledPlans.length);
  unscheduledPlans.forEach(p => console.log(` • Plan #: ${p.planNumber} | Product: ${p.productName || p.productId} | Qty: ${p.quantity} | Status: ${p.status}`));

  console.log('\n====================================================');
  process.exit(0);
}

inspectPendingApprovals().catch(err => {
  console.error('Audit inspection error:', err);
  process.exit(1);
});
