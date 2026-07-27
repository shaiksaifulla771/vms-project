const mongoose = require('mongoose');

async function auditComponentReferences() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');

  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String,
    status: String
  }));

  const BOM = mongoose.model('BOM', new mongoose.Schema({
    productId: mongoose.Schema.Types.ObjectId,
    components: Array,
    status: String
  }));

  const PurchaseOrder = mongoose.model('PurchaseOrder', new mongoose.Schema({
    items: Array
  }));

  const InventoryItem = mongoose.model('InventoryItem', new mongoose.Schema({
    materialId: mongoose.Schema.Types.ObjectId,
    balance: Number,
    quantity: Number
  }));

  const ProductionOrder = mongoose.model('ProductionOrder', new mongoose.Schema({
    productId: mongoose.Schema.Types.ObjectId
  }));

  // Fetch all candidate materials matching test data patterns
  const candidateMaterials = await Material.find({
    $or: [
      { name: /^Production Sourced C/i },
      { name: /^Safety Test Material/i },
      { description: /Automated production test/i },
      { name: /^Cycle Test/i },
      { name: /^Duplicate Test/i },
      { name: /^Batch Test/i },
      { code: /^MAT-CYC-/i },
      { code: /^MAT-DUP-/i },
      { code: /^MAT-BATCH-/i },
      { code: /^MAT-PQ-/i },
      { code: /^C[1-5]-/i }
    ]
  }).lean();

  console.log(`Auditing ${candidateMaterials.length} test materials against ALL BOMs (including status: Deleted)...`);

  const safeToDelete = [];
  const flaggedReferenced = [];

  for (const mat of candidateMaterials) {
    // 1. Check as Product ID in ANY BOM (Active or Deleted)
    const bomAsProduct = await BOM.findOne({ productId: mat._id });

    // 2. Check as Component Material ID in ANY BOM (Active or Deleted)
    const bomAsComponent = await BOM.findOne({ 'components.materialId': mat._id });

    // 3. Check Purchase Orders
    const poRef = await PurchaseOrder.findOne({ 'items.materialId': mat._id });

    // 4. Check Production Orders
    const prodOrderRef = await ProductionOrder.findOne({ productId: mat._id });

    // 5. Check Inventory Items balance
    const invItem = await InventoryItem.findOne({ materialId: mat._id });
    const hasBalance = invItem && ((invItem.balance || invItem.quantity || 0) > 0);

    const isReferenced = Boolean(bomAsProduct || bomAsComponent || poRef || prodOrderRef || hasBalance);

    const reasons = [];
    if (bomAsProduct) reasons.push(`BOM Product (${bomAsProduct.status || 'Active'})`);
    if (bomAsComponent) reasons.push(`BOM Component (${bomAsComponent.status || 'Active'})`);
    if (poRef) reasons.push('Purchase Order item');
    if (prodOrderRef) reasons.push('Production Order product');
    if (hasBalance) reasons.push(`Inventory balance > 0 (${invItem.balance || invItem.quantity})`);

    const info = {
      _id: mat._id,
      name: mat.name,
      code: mat.code,
      status: mat.status || 'Active',
      safe: !isReferenced,
      reason: reasons.join(', ') || 'None (Safe to Delete)'
    };

    if (isReferenced) {
      flaggedReferenced.push(info);
    } else {
      safeToDelete.push(info);
    }
  }

  console.log("\n==================== REVISED SAFE TO DELETE LIST ====================");
  console.table(safeToDelete.map(r => ({ Name: r.name, Code: r.code, Status: r.status })));

  console.log("\n==================== REVISED FLAGGED REFERENCED LIST ====================");
  console.table(flaggedReferenced.map(r => ({ Name: r.name, Code: r.code, Reason: r.reason })));

  console.log(`\nFinal Audit Totals:`);
  console.log(`Total Candidates Inspected: ${candidateMaterials.length}`);
  console.log(`Safe to Delete: ${safeToDelete.length}`);
  console.log(`Flagged as Referenced (Excluded): ${flaggedReferenced.length}`);

  await mongoose.disconnect();
}

auditComponentReferences();
