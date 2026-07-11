const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Material = require('./models/Material');
const connectDB = require('./config/db');

dotenv.config();

connectDB().then(async () => {
  try {
    const materials = await Material.find({});
    console.log(`Found ${materials.length} materials. Mixing up codes...`);

    const codeTemplates = [
      'RAW-CUM-001',
      '02',
      'RAW-FENUGREEK-POWDER-125G-003',
      '9999',
      'PKG-TIN-SEMI-LARGE-005',
      '88',
      'FIN-PUREE-BANANA-200ML-007',
      '0008',
      'RAW-WHEAT-FLOUR-BULK-009',
      '0010'
    ];

    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      const template = codeTemplates[i % codeTemplates.length];
      const finalCode = `${template}-${i + 1}`.toUpperCase();
      console.log(`Updating "${mat.name}" code from "${mat.code}" to "${finalCode}"`);
      mat.code = finalCode;
      await mat.save();
    }

    console.log('Successfully mixed up material codes!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
