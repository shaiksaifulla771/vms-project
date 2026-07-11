const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const Material = require('./models/Material');
const connectDB = require('./config/db');

dotenv.config();

connectDB().then(async () => {
  try {
    const recipePath = path.join(__dirname, 'config', 'all_recipes.json');
    if (!fs.existsSync(recipePath)) {
      throw new Error(`Recipe file not found at ${recipePath}`);
    }

    const rawData = fs.readFileSync(recipePath, 'utf8');
    const parsedData = JSON.parse(rawData);

    // Build a map of name -> original code
    const nameToCodeMap = {};
    
    // Raw materials
    const rawMaterialKeys = Object.keys(parsedData.raw_materials);
    for (let code of rawMaterialKeys) {
      const rmData = parsedData.raw_materials[code];
      nameToCodeMap[rmData.name.trim().toLowerCase()] = code;
    }

    // Finished goods
    const finishedGoodsKeys = Object.keys(parsedData.finished_goods);
    for (let code of finishedGoodsKeys) {
      const fgData = parsedData.finished_goods[code];
      nameToCodeMap[fgData.name.trim().toLowerCase()] = code;
    }

    const materials = await Material.find({});
    console.log(`Found ${materials.length} materials. Restoring original codes...`);

    for (let mat of materials) {
      const originalCode = nameToCodeMap[mat.name.trim().toLowerCase()];
      if (originalCode) {
        console.log(`Restoring "${mat.name}" to code "${originalCode}"`);
        mat.code = originalCode;
        await mat.save();
      } else {
        console.log(`Could not find original code for "${mat.name}", keeping current code.`);
      }
    }

    console.log('Successfully restored original material codes!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
