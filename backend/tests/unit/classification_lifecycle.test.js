const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const MaterialClassification = require('../../models/MaterialClassification');
const VendorClassification = require('../../models/VendorClassification');
const Material = require('../../models/Material');
const Vendor = require('../../models/Vendor');
const classificationController = require('../../controllers/classificationController');

describe('Classification & Subcategory Lifecycle Unit Tests', () => {
  let rootCat = null;
  let subCat = null;
  let childSubCat = null;
  let altCat = null;
  let testMaterial1 = null;
  let testMaterial2 = null;

  beforeAll(async () => {
    await connectDB();
  }, 30000);

  afterAll(async () => {
    await MaterialClassification.collection.deleteMany({});
    await VendorClassification.collection.deleteMany({});
    await Material.collection.deleteMany({});
    await Vendor.collection.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await MaterialClassification.collection.deleteMany({});
    await VendorClassification.collection.deleteMany({});
    await Material.collection.deleteMany({});
    await Vendor.collection.deleteMany({});

    // Seed test hierarchy
    rootCat = await MaterialClassification.create({
      name: 'Raw Materials',
      code: 'RAW',
      parentId: null,
      status: 'Active'
    });

    subCat = await MaterialClassification.create({
      name: 'Grains & Cereals',
      code: 'GRN',
      parentId: rootCat._id,
      status: 'Active'
    });

    childSubCat = await MaterialClassification.create({
      name: 'Organic Oats',
      code: 'OAT',
      parentId: subCat._id,
      status: 'Active'
    });

    altCat = await MaterialClassification.create({
      name: 'Sweeteners',
      code: 'SWT',
      parentId: rootCat._id,
      status: 'Active'
    });

    testMaterial1 = await Material.create({
      name: 'Rolled Oats 50kg',
      code: 'MAT-OAT-001',
      unit: 'kg',
      basePrice: 45,
      categoryId: childSubCat._id,
      status: 'Active'
    });

    testMaterial2 = await Material.create({
      name: 'Barley Flakes 25kg',
      code: 'MAT-BAR-002',
      unit: 'kg',
      basePrice: 38,
      categoryId: subCat._id,
      status: 'Active'
    });
  });

  test('1. Hierarchy Structure: Should query categories and properly resolve parent-child tree', async () => {
    const req = { query: { type: 'material' } };
    let jsonResult = null;
    const res = {
      status: (code) => {
        expect(code).toBe(200);
        return {
          json: (data) => { jsonResult = data; }
        };
      }
    };

    await classificationController.getClassifications(req, res, () => {});

    expect(jsonResult.success).toBe(true);
    expect(jsonResult.data.length).toBe(4);

    const oatsCat = jsonResult.data.find(c => c.code === 'OAT');
    expect(oatsCat).toBeDefined();
    expect(String(oatsCat.parentId?._id || oatsCat.parentId)).toBe(String(subCat._id));
    expect(oatsCat.itemCount).toBe(1); // 1 material directly assigned
  });

  test('2. Circular Hierarchy Guard: Should block setting category parent to self or descendant', async () => {
    // Attempt to set rootCat's parent to its grandchild childSubCat
    const req = {
      params: { id: rootCat._id },
      body: {
        type: 'material',
        parentId: childSubCat._id
      }
    };
    let errorStatus = null;
    let errorJson = null;
    const res = {
      status: (code) => {
        errorStatus = code;
        return {
          json: (data) => { errorJson = data; }
        };
      }
    };

    await classificationController.updateClassification(req, res, () => {});

    expect(errorStatus).toBe(400);
    expect(errorJson.success).toBe(false);
    expect(errorJson.error).toContain('circular');
  });

  test('3. Linked Items Drilldown: Should retrieve items with includeDescendants true/false', async () => {
    // A. Direct items only on subCat (Grains & Cereals)
    const reqDirect = {
      params: { id: subCat._id },
      query: { type: 'material', includeDescendants: 'false' }
    };
    let directResult = null;
    const resDirect = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { directResult = data; } };
      }
    };

    await classificationController.getClassificationItems(reqDirect, resDirect, () => {});
    expect(directResult.count).toBe(1);
    expect(directResult.data[0].code).toBe('MAT-BAR-002');

    // B. Subtree items from rootCat with includeDescendants: 'true'
    const reqTree = {
      params: { id: rootCat._id },
      query: { type: 'material', includeDescendants: 'true' }
    };
    let treeResult = null;
    const resTree = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { treeResult = data; } };
      }
    };

    await classificationController.getClassificationItems(reqTree, resTree, () => {});
    expect(treeResult.count).toBe(2); // Both MAT-BAR-002 and MAT-OAT-001
  });

  test('4. Item Linking & Unlinking: Should bulk assign and detach items cleanly', async () => {
    // Create an unassigned material
    const unassignedMat = await Material.create({
      name: 'Organic Cane Sugar',
      code: 'MAT-SUG-003',
      unit: 'kg',
      basePrice: 50,
      categoryId: null,
      status: 'Active'
    });

    // Link unassignedMat to altCat (Sweeteners)
    const reqLink = {
      params: { id: altCat._id },
      body: { type: 'material', itemIds: [unassignedMat._id] }
    };
    let linkResult = null;
    const resLink = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { linkResult = data; } };
      }
    };

    await classificationController.linkItemsToClassification(reqLink, resLink, () => {});
    expect(linkResult.success).toBe(true);
    expect(linkResult.linkedCount).toBe(1);

    const checkLinked = await Material.findById(unassignedMat._id);
    expect(String(checkLinked.categoryId)).toBe(String(altCat._id));

    // Unlink
    const reqUnlink = {
      params: { id: altCat._id },
      body: { type: 'material', itemIds: [unassignedMat._id] }
    };
    let unlinkResult = null;
    const resUnlink = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { unlinkResult = data; } };
      }
    };

    await classificationController.unlinkItemsFromClassification(reqUnlink, resUnlink, () => {});
    expect(unlinkResult.unlinkedCount).toBe(1);

    const checkUnlinked = await Material.findById(unassignedMat._id);
    expect(checkUnlinked.categoryId).toBeNull();
  });

  test('5. Deletion Safety & Reassignment: Blocks delete when items exist; allows after reassignment', async () => {
    // Attempt delete on childSubCat which has MAT-OAT-001
    const reqDel = {
      params: { id: childSubCat._id },
      query: { type: 'material' }
    };
    let delStatus = null;
    let delJson = null;
    const resDel = {
      status: (code) => {
        delStatus = code;
        return { json: (data) => { delJson = data; } };
      }
    };

    await classificationController.deleteClassification(reqDel, resDel, () => {});
    expect(delStatus).toBe(400);
    expect(delJson.error).toContain('assigned to this classification');

    // Reassign items from childSubCat to altCat
    const reqReassign = {
      params: { id: childSubCat._id },
      body: { type: 'material', targetCategoryId: altCat._id }
    };
    let reassignResult = null;
    const resReassign = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { reassignResult = data; } };
      }
    };

    await classificationController.reassignClassificationItems(reqReassign, resReassign, () => {});
    expect(reassignResult.reassignedCount).toBe(1);

    // Verify MAT-OAT-001 now has altCat
    const reassignedMat = await Material.findById(testMaterial1._id);
    expect(String(reassignedMat.categoryId)).toBe(String(altCat._id));

    // Now delete should succeed
    let finalStatus = null;
    const resFinal = {
      status: (code) => {
        finalStatus = code;
        return { json: () => {} };
      }
    };
    await classificationController.deleteClassification(reqDel, resFinal, () => {});
    expect(finalStatus).toBe(200);

    const deletedDoc = await MaterialClassification.findById(childSubCat._id);
    expect(deletedDoc.status).toBe('Deleted');
  });

  test('6. Master Data Harvesting & Sync: Dynamically extracts categories & subcategories from materials and vendors', async () => {
    // Clear classifications
    await MaterialClassification.collection.deleteMany({});
    await VendorClassification.collection.deleteMany({});

    // Create materials with types and subcategories
    await Material.create({
      name: 'Fresh Organic Mango Pulp',
      code: 'MAT-MANGO-01',
      unit: 'kg',
      type: 'Raw Material',
      subcategory: 'Fresh Fruits',
      categoryId: null
    });
    await Material.create({
      name: 'Sterilized Glass Jar 250ml',
      code: 'MAT-JAR-01',
      unit: 'pcs',
      type: 'Packaged Material',
      subcategory: 'Glass Packaging',
      categoryId: null
    });

    // Create vendors with categories and subcategories
    await Vendor.create({
      name: 'Nature Fresh Farms',
      company: 'Nature Fresh Farms Pvt Ltd',
      category: 'Fresh Produce Supplier',
      subCategory: 'Fruits',
      categoryId: null
    });

    // Run Master Data Sync for Materials
    const matSyncRes = await classificationController.syncMasterData('material');
    expect(matSyncRes.createdCategories).toBeGreaterThanOrEqual(2);
    expect(matSyncRes.createdSubcategories).toBeGreaterThanOrEqual(2);

    // Verify MaterialClassification exists for Raw Material and Fresh Fruits
    const rawCat = await MaterialClassification.findOne({ name: 'Raw Material', parentId: null });
    expect(rawCat).toBeDefined();
    const freshSubCat = await MaterialClassification.findOne({ name: 'Fresh Fruits', parentId: rawCat._id });
    expect(freshSubCat).toBeDefined();

    // Verify material was linked
    const mangoMat = await Material.findOne({ code: 'MAT-MANGO-01' });
    expect(String(mangoMat.categoryId)).toBe(String(freshSubCat._id));

    // Run Master Data Sync for Vendors
    const venSyncRes = await classificationController.syncMasterData('vendor');
    expect(venSyncRes.createdCategories).toBeGreaterThanOrEqual(1);

    const produceCat = await VendorClassification.findOne({ name: 'Fresh Produce Supplier', parentId: null });
    expect(produceCat).toBeDefined();
    const fruitsSub = await VendorClassification.findOne({ name: 'Fruits', parentId: produceCat._id });
    expect(fruitsSub).toBeDefined();

    const vendorDoc = await Vendor.findOne({ name: 'Nature Fresh Farms' });
    expect(String(vendorDoc.categoryId)).toBe(String(fruitsSub._id));
  });

  test('7. Arbitrary Depth (N-Level) Sub-categorization: Supports 4+ nested levels with recursive item rollups', async () => {
    await MaterialClassification.collection.deleteMany({});
    await Material.collection.deleteMany({});

    // Level 0: Root Category
    const l0 = await MaterialClassification.create({ name: 'L0 Packaging', parentId: null, status: 'Active' });
    // Level 1: Sub-category
    const l1 = await MaterialClassification.create({ name: 'L1 Primary Packaging', parentId: l0._id, status: 'Active' });
    // Level 2: Sub-sub-category
    const l2 = await MaterialClassification.create({ name: 'L2 Bottles & Jars', parentId: l1._id, status: 'Active' });
    // Level 3: Sub-sub-sub-category
    const l3 = await MaterialClassification.create({ name: 'L3 Amber Glass 100ml', parentId: l2._id, status: 'Active' });

    // Link item directly to Level 3
    await Material.create({
      name: 'Amber Glass Bottle 100ml Spec-A',
      code: 'PKG-AMB-100',
      unit: 'pcs',
      categoryId: l3._id,
      status: 'Active'
    });

    // Query getClassifications
    const req = { query: { type: 'material' } };
    let result = null;
    const res = {
      status: (code) => {
        expect(code).toBe(200);
        return { json: (data) => { result = data; } };
      }
    };

    await classificationController.getClassifications(req, res, () => {});
    expect(result.data.length).toBe(4);

    const nodeMap = new Map();
    result.data.forEach(n => nodeMap.set(n.name, n));

    // Verify accurate depth levels
    expect(nodeMap.get('L0 Packaging').depth).toBe(0);
    expect(nodeMap.get('L1 Primary Packaging').depth).toBe(1);
    expect(nodeMap.get('L2 Bottles & Jars').depth).toBe(2);
    expect(nodeMap.get('L3 Amber Glass 100ml').depth).toBe(3);

    // Verify direct vs totalItemCount rollup
    expect(nodeMap.get('L3 Amber Glass 100ml').itemCount).toBe(1);
    expect(nodeMap.get('L3 Amber Glass 100ml').totalItemCount).toBe(1);

    // Ancestor nodes have 0 direct items, but totalItemCount = 1 through recursive rollup
    expect(nodeMap.get('L2 Bottles & Jars').itemCount).toBe(0);
    expect(nodeMap.get('L2 Bottles & Jars').totalItemCount).toBe(1);

    expect(nodeMap.get('L1 Primary Packaging').itemCount).toBe(0);
    expect(nodeMap.get('L1 Primary Packaging').totalItemCount).toBe(1);

    expect(nodeMap.get('L0 Packaging').itemCount).toBe(0);
    expect(nodeMap.get('L0 Packaging').totalItemCount).toBe(1);
  });
});
