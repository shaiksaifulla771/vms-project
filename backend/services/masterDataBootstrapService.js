const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const Site = require('../models/Site');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const AuditLog = require('../models/AuditLog');

function determineSubcategory(name, type, vendor) {
  const lowerName = (name || '').toLowerCase();
  const lowerVendor = (vendor || '').toLowerCase();
  
  if (type === 'Raw Material') {
    if (
      lowerName.includes('pumpkin') || 
      lowerName.includes('banana') || 
      lowerName.includes('apple') || 
      lowerName.includes('mango') || 
      lowerName.includes('strawberry') || 
      lowerName.includes('papaya') || 
      lowerName.includes('carrot') || 
      lowerName.includes('tomato') || 
      lowerName.includes('garlic') || 
      lowerName.includes('ginger') || 
      lowerName.includes('onion') || 
      lowerName.includes('spinach') || 
      lowerName.includes('fresh') ||
      lowerVendor.includes('vegetable') || 
      lowerVendor.includes('fruits') ||
      lowerVendor.includes('jain farm fresh') || 
      lowerVendor.includes('shimla hills')
    ) {
      return 'Fresh';
    }
    if (
      lowerName.includes('pouch') || 
      lowerName.includes('cap') || 
      lowerName.includes('box') || 
      lowerName.includes('roll') || 
      lowerName.includes('film') || 
      lowerName.includes('brand') || 
      lowerVendor.includes('retail') ||
      lowerVendor.includes('brand')
    ) {
      return 'Retail';
    }
    return 'Standardized';
  } else {
    if (lowerName.includes('melt') || lowerName.includes('yogurt')) {
      return 'Yogurt Melts';
    }
    if (
      lowerName.includes('porridge') || 
      lowerName.includes('oats') || 
      lowerName.includes('wheat') || 
      lowerName.includes('rice') || 
      lowerName.includes('millet') || 
      lowerName.includes('lentil') || 
      lowerName.includes('barley') || 
      lowerName.includes('ragi') ||
      lowerName.includes('khichdi')
    ) {
      return 'Porridge';
    }
    return 'Puree';
  }
}

class MasterDataBootstrapService {
  /**
   * Idempotent Master Data Provisioning
   * Guarantees that Sites, Warehouses, Users, Vendors, Materials, BOMs and Stock exist.
   */
  static async bootstrapMasterData(force = false) {
    try {
      console.log('[MasterDataBootstrap] 🚀 Verifying Master Data status...');
      
      const materialCount = await Material.countDocuments();
      const siteCount = await Site.countDocuments();
      const bomCount = await BOM.countDocuments();

      if (!force && materialCount > 0 && siteCount > 0 && bomCount > 0) {
        console.log(`[MasterDataBootstrap] 🟢 Master data already populated (${materialCount} materials, ${siteCount} sites, ${bomCount} BOMs).`);
        return { success: true, alreadySeeded: true };
      }

      console.log('[MasterDataBootstrap] 📦 Seeding Sites & Warehouses...');
      
      // 1. Seed Sites
      const siteDefs = [
        {
          code: 'HYD-01',
          name: 'Hyderabad Plant',
          type: 'Manufacturing Plant',
          address: { street: 'Phase II, HITEC City', city: 'Hyderabad', state: 'Telangana', country: 'India', postalCode: '500081' },
          status: 'Active'
        },
        {
          code: 'BLR-01',
          name: 'Bangalore Plant',
          type: 'Manufacturing Plant',
          address: { street: 'Electronic City Phase 1', city: 'Bangalore', state: 'Karnataka', country: 'India', postalCode: '560100' },
          status: 'Active'
        },
        {
          code: 'MAA-01',
          name: 'Chennai Distribution Center',
          type: 'Distribution Center',
          address: { street: 'SIPCOT Industrial Park', city: 'Chennai', state: 'Tamil Nadu', country: 'India', postalCode: '600001' },
          status: 'Active'
        },
        {
          code: 'PUN-01',
          name: 'Pune Facility',
          type: 'R&D Center',
          address: { street: 'Hinjawadi IT Park', city: 'Pune', state: 'Maharashtra', country: 'India', postalCode: '411057' },
          status: 'Active'
        }
      ];

      const createdSites = {};
      for (const s of siteDefs) {
        const doc = await Site.findOneAndUpdate({ code: s.code }, { $set: s }, { upsert: true, new: true });
        createdSites[s.code] = doc;
      }

      // 2. Seed Warehouses linked to Sites
      const warehouseDefs = [
        { code: 'WH-HYD-RAW', name: 'Hyderabad Raw Materials Depot', siteId: createdSites['HYD-01']._id, type: 'Raw', status: 'Active' },
        { code: 'WH-HYD-FG', name: 'Hyderabad Finished Goods Hub', siteId: createdSites['HYD-01']._id, type: 'FG', status: 'Active' },
        { code: 'WH-HYD-WIP', name: 'Hyderabad WIP Staging', siteId: createdSites['HYD-01']._id, type: 'WIP', status: 'Active' },
        { code: 'WH-BLR-RAW', name: 'Bangalore RM Store', siteId: createdSites['BLR-01']._id, type: 'Raw', status: 'Active' },
        { code: 'WH-BLR-FG', name: 'Bangalore Dispatch Depot', siteId: createdSites['BLR-01']._id, type: 'FG', status: 'Active' },
        { code: 'WH-MAA-DC', name: 'Chennai Central Distribution Warehouse', siteId: createdSites['MAA-01']._id, type: 'FG', status: 'Active' }
      ];

      const createdWarehouses = {};
      for (const w of warehouseDefs) {
        const doc = await Warehouse.findOneAndUpdate({ code: w.code }, { $set: w }, { upsert: true, new: true });
        createdWarehouses[w.code] = doc;
      }

      const allSiteIds = Object.values(createdSites).map(s => s._id);
      const allWarehouseIds = Object.values(createdWarehouses).map(w => w._id);
      const defaultSiteId = createdSites['HYD-01']._id;
      const defaultRawWarehouseId = createdWarehouses['WH-HYD-RAW']._id;
      const defaultFgWarehouseId = createdWarehouses['WH-HYD-FG']._id;

      // 3. Seed Enterprise Users
      console.log('[MasterDataBootstrap] 👥 Seeding Enterprise Users & Scopes...');
      const userDefs = [
        {
          username: 'Shaik Saifulla',
          email: 'shaiksaifulla771@gmail.com',
          password: 'Saif@2005',
          role: 'Admin',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          siteIds: allSiteIds,
          warehouseIds: allWarehouseIds,
          fieldSecurityLevel: 'Restricted'
        },
        {
          username: 'System Admin',
          email: 'admin@vms.com',
          password: 'admin123',
          role: 'Admin',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          siteIds: allSiteIds,
          warehouseIds: allWarehouseIds,
          fieldSecurityLevel: 'Restricted'
        },
        {
          username: 'Inventory Lead',
          email: 'inventory@vms.com',
          password: 'manager123',
          role: 'Inventory Manager',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          siteIds: allSiteIds,
          warehouseIds: allWarehouseIds,
          fieldSecurityLevel: 'Internal'
        },
        {
          username: 'Production Supervisor',
          email: 'production@vms.com',
          password: 'manager123',
          role: 'Production Manager',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          siteIds: allSiteIds,
          warehouseIds: allWarehouseIds,
          fieldSecurityLevel: 'Internal'
        },
        {
          username: 'Master Planner',
          email: 'planner@vms.com',
          password: 'planner123',
          role: 'Planner',
          accountStatus: 'ACTIVE',
          approvalStatus: 'APPROVED',
          isVerified: true,
          emailVerified: true,
          siteIds: allSiteIds,
          warehouseIds: allWarehouseIds,
          fieldSecurityLevel: 'Internal'
        }
      ];

      for (const u of userDefs) {
        const existing = await User.findOne({ email: u.email });
        if (existing) {
          existing.username = u.username;
          existing.role = u.role;
          existing.accountStatus = u.accountStatus;
          existing.approvalStatus = u.approvalStatus;
          existing.isVerified = true;
          existing.emailVerified = true;
          existing.siteIds = allSiteIds;
          existing.warehouseIds = allWarehouseIds;
          await existing.save();
        } else {
          await User.create(u);
        }
      }

      // 4. Seed Recipes, Vendors, Materials & BOMs from all_recipes.json
      const recipePath = path.join(__dirname, '../config', 'all_recipes.json');
      if (fs.existsSync(recipePath)) {
        console.log('[MasterDataBootstrap] 📋 Parsing Recipe Master Data (all_recipes.json)...');
        const rawData = fs.readFileSync(recipePath, 'utf8');
        const parsedData = JSON.parse(rawData);

        // A. Seed Vendors
        const seededVendors = {};
        for (let vendorName of (parsedData.vendors || [])) {
          const slug = vendorName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const email = `contact@${slug || 'sourcing'}.com`;
          const dbVendor = await Vendor.findOneAndUpdate(
            { company: vendorName },
            {
              $set: {
                name: `${vendorName} Lead`,
                company: vendorName,
                email: email,
                phone: '+91-98765-99999',
                address: `${vendorName} Depot Complex, Sourcing Sector`,
                category: 'Other',
                status: 'Active'
              }
            },
            { upsert: true, new: true }
          );
          seededVendors[vendorName] = dbVendor._id;
        }
        console.log(`  ✓ Registered ${Object.keys(seededVendors).length} Enterprise Vendors`);

        // B. Seed Raw Materials & Initial Stocks
        const seededRawMaterials = {};
        const rawMaterialKeys = Object.keys(parsedData.raw_materials || {});
        for (let code of rawMaterialKeys) {
          const rmData = parsedData.raw_materials[code];
          const dbRm = await Material.findOneAndUpdate(
            { code: code },
            {
              $set: {
                name: rmData.name,
                code: code,
                unit: rmData.unit || 'kg',
                type: 'Raw Material',
                subcategory: determineSubcategory(rmData.name, 'Raw Material', rmData.vendor),
                description: `Raw component item sourced from ${rmData.vendor || 'Supplier'}`
              }
            },
            { upsert: true, new: true }
          );
          seededRawMaterials[code] = dbRm._id;

          // Seed baseline stock (2,500 units)
          const existingItem = await InventoryItem.findOne({ materialId: dbRm._id, warehouseId: defaultRawWarehouseId });
          if (!existingItem) {
            await InventoryItem.create({
              materialId: dbRm._id,
              siteId: defaultSiteId,
              warehouseId: defaultRawWarehouseId,
              balance: 2500,
              onHand: 2500,
              available: 2500,
              batchNumber: 'BATCH-RM-INIT'
            });
            await InventoryTransaction.create({
              materialId: dbRm._id,
              siteId: defaultSiteId,
              warehouseId: defaultRawWarehouseId,
              quantity: 2500,
              type: 'adjustment',
              notes: `Initial baseline stock for ${rmData.name}`
            });
          }
        }
        console.log(`  ✓ Registered ${rawMaterialKeys.length} Raw Materials with baseline inventory`);

        // C. Seed Finished Goods
        const seededFinishedGoods = {};
        for (let fg of (parsedData.finished_goods || [])) {
          const dbFg = await Material.findOneAndUpdate(
            { code: fg.code },
            {
              $set: {
                name: fg.name,
                code: fg.code,
                unit: 'pcs',
                type: 'Finished',
                subcategory: determineSubcategory(fg.name, 'Finished', ''),
                description: `Assembled finished spouted food pouch for ${fg.name}`
              }
            },
            { upsert: true, new: true }
          );
          seededFinishedGoods[fg.code] = dbFg._id;

          const existingFgItem = await InventoryItem.findOne({ materialId: dbFg._id, warehouseId: defaultFgWarehouseId });
          if (!existingFgItem) {
            await InventoryItem.create({
              materialId: dbFg._id,
              siteId: defaultSiteId,
              warehouseId: defaultFgWarehouseId,
              balance: 250,
              onHand: 250,
              available: 250,
              batchNumber: 'BATCH-FG-INIT'
            });
            await InventoryTransaction.create({
              materialId: dbFg._id,
              siteId: defaultSiteId,
              warehouseId: defaultFgWarehouseId,
              quantity: 250,
              type: 'adjustment',
              notes: `Initial finished goods stock for ${fg.name}`
            });
          }
        }
        console.log(`  ✓ Registered ${(parsedData.finished_goods || []).length} Finished Goods products`);

        // D. Seed BOM Recipes
        for (let fg of (parsedData.finished_goods || [])) {
          const productId = seededFinishedGoods[fg.code];
          if (!productId) continue;

          const components = (fg.components || [])
            .map(c => {
              const materialId = seededRawMaterials[c.code];
              let scaledQty = c.quantity / 1000;
              return { materialId, quantity: scaledQty, uom: 'kg', lossPercentage: 0 };
            })
            .filter(comp => comp.materialId && comp.quantity >= 0.000001);

          if (components.length > 0) {
            const bomNum = `BOM-${fg.code}`;
            const existingBom = await BOM.findOne({ productId });
            if (existingBom) {
              existingBom.bomNumber = bomNum;
              existingBom.components = components;
              existingBom.batchSize = 1000;
              existingBom.batchUOM = 'pcs';
              existingBom.status = 'Active';
              await existingBom.save();
            } else {
              await BOM.create({
                productId,
                bomNumber: bomNum,
                batchSize: 1000,
                batchUOM: 'pcs',
                status: 'Active',
                components
              });
            }
          }
        }
        console.log('  ✓ Registered all multi-component BOM Recipes.');
      }

      console.log('[MasterDataBootstrap] 🌟 Master Data Bootstrap completed successfully!');
      return { success: true, message: 'Master Data successfully restored & synchronized.' };
    } catch (err) {
      console.error('[MasterDataBootstrap] ❌ Bootstrap Error:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = MasterDataBootstrapService;
