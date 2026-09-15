const mongoose = require('mongoose');
require('dotenv').config();

const Material = require('../models/Material');
const MPN = require('../models/MPN');

async function healMPNs() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vms');
  console.log('Connected to MongoDB for MPN material reference healing...');

  const materials = await Material.find({ status: { $ne: 'Deleted' } }).lean();
  const matCodeMap = new Map();
  materials.forEach(m => {
    if (m.code) matCodeMap.set(m.code.trim().toUpperCase(), m._id);
    if (m.name) matCodeMap.set(m.name.trim().toLowerCase(), m._id);
  });

  const mpns = await MPN.find({ status: { $ne: 'Deleted' } });
  let fixedCount = 0;

  for (const mpn of mpns) {
    const existingMat = mpn.materialId ? await Material.findById(mpn.materialId) : null;
    if (!existingMat) {
      // Try to match from mpnCode (e.g. MPN-AUTO-RM-BANANA-POWDER-SP -> RM-BANANA-POWDER-SP)
      let targetMatId = null;
      if (mpn.mpnCode && mpn.mpnCode.startsWith('MPN-AUTO-')) {
        const matCode = mpn.mpnCode.replace('MPN-AUTO-', '').trim().toUpperCase();
        targetMatId = matCodeMap.get(matCode);
      }
      if (!targetMatId && mpn.manufacturerPartNumber && mpn.manufacturerPartNumber.startsWith('PN-')) {
        const matCode = mpn.manufacturerPartNumber.replace('PN-', '').trim().toUpperCase();
        targetMatId = matCodeMap.get(matCode);
      }
      if (!targetMatId && mpn.mpnName) {
        const cleanName = mpn.mpnName.replace(/^Auto MPN for\s+/i, '').trim().toLowerCase();
        targetMatId = matCodeMap.get(cleanName);
      }

      if (targetMatId) {
        mpn.materialId = targetMatId;
        await mpn.save();
        fixedCount++;
        console.log(`[Healed MPN] ${mpn.mpnCode} -> Material ID: ${targetMatId}`);
      }
    }
  }

  console.log(`Finished healing MPNs. Total healed: ${fixedCount}`);
  await mongoose.disconnect();
}

healMPNs().catch(err => {
  console.error('Healing failed:', err);
  process.exit(1);
});
