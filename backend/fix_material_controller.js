const mongoose = require('mongoose');
const fs = require('fs');

async function fixDB() {
  await mongoose.connect('mongodb://127.0.0.1/vms');
  console.log("Connected to MongoDB");
  const db = mongoose.connection.db;
  const materialsColl = db.collection('materials');

  const materials = await materialsColl.find({}).sort({ _id: 1 }).toArray();
  let currentNum = 1000;

  for (const m of materials) {
    let newCode = m.code;
    
    // If code is null, undefined, or missing
    if (!newCode) {
       currentNum++;
       newCode = `M${currentNum}`;
    } else {
       const strCode = newCode.toString().trim().toUpperCase();
       if (!strCode.startsWith('M')) {
         // Bad code! E.g. "1001" or "2001"
         currentNum++;
         newCode = `M${currentNum}`;
       } else {
         // It's Mxxxx, update currentNum to max
         const match = strCode.match(/\d+/);
         if (match) {
           const num = parseInt(match[0], 10);
           if (!isNaN(num) && num > currentNum) {
             currentNum = num;
           }
         }
       }
    }
    
    if (newCode !== m.code) {
      console.log(`Updating ${m.code || 'null'} -> ${newCode}`);
      // Since there's a unique index on code, handle duplicates by just incrementing if needed
      let success = false;
      while(!success) {
        try {
          await materialsColl.updateOne({ _id: m._id }, { $set: { code: newCode } });
          success = true;
        } catch (err) {
          if (err.code === 11000) {
            currentNum++;
            newCode = `M${currentNum}`;
          } else {
            throw err;
          }
        }
      }
    }
  }
  console.log("DB Fixed!");
  await mongoose.disconnect();
}

function fixController() {
  const path = 'C:/Users/DELL/.gemini/antigravity/scratch/vms-project/backend/controllers/materialController.js';
  let content = fs.readFileSync(path, 'utf8');

  const startIdx = content.indexOf('exports.createMaterialsBatch = async (req, res, next) => {');
  const endIdx = content.indexOf('exports.createMaterialsBatchUpload = async (req, res, next) => {');

  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find start or end index for createMaterialsBatch");
    return;
  }

  const newFunc = `exports.createMaterialsBatch = async (req, res, next) => {
  try {
    const { items, importSource } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Invalid items array' });
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let errorsCount = 0;
    const errors = [];

    // Pre-fetch all codes and names for quick duplicate checking
    const existingMaterials = await Material.find({}, { code: 1, name: 1 });
    const codeMap = new Map(existingMaterials.map(m => [m.code.toUpperCase().trim(), m]));
    const nameMap = new Map(existingMaterials.map(m => [m.name.toLowerCase().trim(), m]));

    // Find last sequence number for auto-assignment
    let lastNum = 1000;
    const lastMat = await Material.findOne().sort({ code: -1 });
    if (lastMat && lastMat.code && lastMat.code.startsWith('M')) {
       const parsed = parseInt(lastMat.code.replace('M', ''), 10);
       if (!isNaN(parsed)) lastNum = parsed;
    }

    // Process valid items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        let { name, code, unit, type, subcategory, status, description, isExistingMatch } = item;
        
        if (!name || !unit) {
          errorsCount++;
          errors.push(\`Row \${i + 1}: Name and unit are required\`);
          continue;
        }

        // Auto-assign code if missing or bad format
        if (!code || typeof code !== 'string' || !code.startsWith('M')) {
           lastNum++;
           code = \`M\${lastNum}\`;
        } else if (code.startsWith('1') && code.length === 4) {
           code = \`M\${code}\`; // Fix 1001 bug
        }

        const formattedName = name ? name.toLowerCase().trim() : '';
        const existingByName = formattedName ? nameMap.get(formattedName) : null;
        const formattedCode = code ? code.toUpperCase().trim() : '';
        const existingByCode = formattedCode ? codeMap.get(formattedCode) : null;
        
        let targetId = null;
        
        if (isExistingMatch && (existingByName || existingByCode)) {
           targetId = (existingByName || existingByCode)._id;
        } else if (existingByCode) {
           targetId = existingByCode._id; // Implicit match by code
        }

        if (targetId) {
          // Update
          const updateData = {
            name,
            unit: unit || 'pcs',
            type: type || 'Raw Material',
            status: status || 'Active',
          };
          if (subcategory) updateData.subcategory = subcategory;
          if (description) updateData.description = description;

          await Material.findByIdAndUpdate(targetId, updateData);
          updatedCount++;
        } else {
          // Insert
          const newDoc = await Material.create({
            name,
            code: formattedCode,
            unit: unit || 'pcs',
            type: type || 'Raw Material',
            subcategory,
            status: status || 'Active',
            description,
            importSource: importSource || 'Excel Import'
          });
          insertedCount++;
          
          // Seed inventory
          await InventoryItem.create({ materialId: newDoc._id, balance: 0 });
        }
      } catch (err) {
        errorsCount++;
        errors.push(\`Row \${i + 1}: \${err.message}\`);
      }
    }

    res.status(200).json({
      success: true,
      insertedCount,
      updatedCount,
      errorsCount,
      errors
    });
  } catch (err) {
    next(err);
  }
};

`;

  content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);

  // Clean up any double injected batchMaterials at the end of the file
  const badInjectIdx = content.lastIndexOf('exports.batchMaterials = async (req, res, next) => {');
  if (badInjectIdx > endIdx) {
    content = content.substring(0, badInjectIdx);
  }

  fs.writeFileSync(path, content);
  console.log("Controller Fixed!");
}

async function run() {
  await fixDB();
  fixController();
  process.exit(0);
}

run();
