const mongoose = require('mongoose');

async function checkBOMs() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const BOM = mongoose.model('BOM', new mongoose.Schema({
    productId: mongoose.Schema.Types.ObjectId,
    components: Array,
    createdAt: Date
  }));
  const Material = mongoose.model('Material', new mongoose.Schema({
    name: String,
    code: String
  }));

  const allBoms = await BOM.find({});
  console.log(`Total BOM documents in DB: ${allBoms.length}`);
  
  let nullProductCount = 0;
  for (const bom of allBoms) {
    if (!bom.productId) {
      nullProductCount++;
      console.log(`BOM ID ${bom._id}: productId is NULL (createdAt: ${bom.createdAt})`);
    } else {
      const mat = await Material.findById(bom.productId);
      if (!mat) {
        console.log(`BOM ID ${bom._id}: productId ${bom.productId} references a DELETED/MISSING Material document!`);
      }
    }
  }

  console.log(`Summary: ${nullProductCount} BOMs have null productId out of ${allBoms.length} total BOMs.`);
  await mongoose.disconnect();
}

checkBOMs();
