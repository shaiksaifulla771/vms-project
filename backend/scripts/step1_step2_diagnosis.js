const mongoose = require('mongoose');

async function runStep1AndStep2() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  
  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String,
    description: String,
    createdAt: Date,
    status: String
  }));

  const Sequence = mongoose.model('Sequence', new mongoose.Schema({
    name: String,
    seq: Number
  }));

  const BOM = mongoose.model('BOM', new mongoose.Schema({
    productId: mongoose.Schema.Types.ObjectId,
    components: Array
  }));

  const PurchaseOrder = mongoose.model('PurchaseOrder', new mongoose.Schema({
    items: Array
  }));

  const InventoryItem = mongoose.model('InventoryItem', new mongoose.Schema({
    materialId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    balance: Number
  }));

  console.log("==================== STEP 1: DIAGNOSIS ====================");
  
  // Query 1: Top 20 materials with numeric M-codes sorted descending by numeric value
  const allMaterials = await Material.find({ code: /^M\d+$/i }).lean();
  allMaterials.sort((a, b) => {
    const numA = parseInt(a.code.substring(1), 10);
    const numB = parseInt(b.code.substring(1), 10);
    return numB - numA;
  });

  const top20 = allMaterials.slice(0, 20);
  console.log("Top 20 numeric M-codes (Sorted Descending):");
  top20.forEach((m, idx) => {
    console.log(`${idx + 1}. Code: ${m.code} | Name: "${m.name}" | Status: ${m.status || 'Active'} | CreatedAt: ${m.createdAt}`);
  });

  // Query 2: Sequence collection for materialCode
  const seqDoc = await Sequence.findOne({ name: 'materialCode' });
  console.log("\nSequence collection 'materialCode' document:", seqDoc);

  console.log("\n==================== STEP 2: PREVIEW TEST DATA FOR REMOVAL ====================");
  
  // Find all materials matching test data patterns
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

  console.log(`Found ${candidateMaterials.length} total test candidate materials.`);

  const safeToDelete = [];
  const flaggedReferenced = [];

  for (const mat of candidateMaterials) {
    // Check BOM reference
    const bomRef = await BOM.findOne({
      $or: [
        { productId: mat._id },
        { 'components.materialId': mat._id }
      ]
    });

    // Check Purchase Order reference
    const poRef = await PurchaseOrder.findOne({
      'items.materialId': mat._id
    });

    // Check Inventory Item balance
    const invItem = await InventoryItem.findOne({ materialId: mat._id });
    const hasBalance = invItem && ((invItem.balance || invItem.quantity || 0) > 0);

    const isReferenced = Boolean(bomRef || poRef || hasBalance);
    const reasonParts = [];
    if (bomRef) reasonParts.push('Linked in BOM');
    if (poRef) reasonParts.push('Linked in Purchase Order');
    if (hasBalance) reasonParts.push(`Inventory balance > 0 (${invItem.balance || invItem.quantity})`);

    const recordInfo = {
      _id: mat._id,
      name: mat.name,
      code: mat.code,
      status: mat.status || 'Active',
      safe: !isReferenced,
      reasons: reasonParts.join(', ') || 'None (Safe to Delete)'
    };

    if (isReferenced) {
      flaggedReferenced.push(recordInfo);
    } else {
      safeToDelete.push(recordInfo);
    }
  }

  console.log("\n--- SAFE TO DELETE (Zero references & zero inventory balance) ---");
  console.table(safeToDelete.map(r => ({ Name: r.name, Code: r.code, Status: r.status })));

  console.log("\n--- FLAGGED AS REFERENCED (EXCLUDED from deletion batch) ---");
  console.table(flaggedReferenced.map(r => ({ Name: r.name, Code: r.code, Reason: r.reasons })));

  console.log(`\nSummary:`);
  console.log(`Total safe-to-delete count: ${safeToDelete.length}`);
  console.log(`Total flagged as referenced (excluded): ${flaggedReferenced.length}`);

  await mongoose.disconnect();
}

runStep1AndStep2();
