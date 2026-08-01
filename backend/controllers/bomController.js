const BOM = require('../models/BOM');
const Material = require('../models/Material');
const ProductionOrder = require('../models/ProductionOrder');
const MPN = require('../models/MPN');
const { detectCycle } = require('../utils/bomGraph');

// Helper to calculate BOM costs based on current MPN prices
const calculateBomCosts = async (components, outputQuantity) => {
  let totalRecipeCost = 0;
  let hasMissingPrices = false;
  const detailedComponents = [];

  for (const comp of components) {
    const mpns = await MPN.find({ materialId: comp.materialId, status: 'Active' }).populate('vendorId', 'company name');
    let lowestPrice = 0;
    let foundPrice = false;
    let mpnUsed = null;

    if (mpns.length > 0) {
      let minMpn = null;
      let minVal = Infinity;
      for (const m of mpns) {
        if (typeof m.unitPrice === 'number' && m.unitPrice < minVal && m.unitPrice > 0) {
          minVal = m.unitPrice;
          minMpn = m;
        }
      }
      if (minMpn) {
        lowestPrice = minVal;
        foundPrice = true;
        mpnUsed = {
          partNumber: minMpn.partNumber,
          vendorName: minMpn.vendorId ? (minMpn.vendorId.company || minMpn.vendorId.name) : 'Unknown Vendor',
          unitPrice: minVal
        };
      }
    }
    
    // Fallback to Material Master basePrice
    if (!foundPrice) {
      const mat = await Material.findById(comp.materialId);
      if (mat && mat.basePrice && mat.basePrice > 0) {
        lowestPrice = mat.basePrice;
        foundPrice = true;
      }
    }

    if (!foundPrice) {
      hasMissingPrices = true;
    }
    
    totalRecipeCost += (comp.quantity * lowestPrice);

    detailedComponents.push({
      materialId: comp.materialId,
      quantity: comp.quantity,
      mpnUsed,
      lowestPrice
    });
  }
  const calculatedUnitCost = outputQuantity > 0 ? (totalRecipeCost / outputQuantity) : 0;
  return { totalRecipeCost, calculatedUnitCost, hasMissingPrices, detailedComponents };
};

// @desc    Get all BOMs
// @route   GET /api/boms
// @access  Private
exports.getBOMs = async (req, res, next) => {
  try {
    const { status } = req.query;
    const queryStatus = status === 'Deleted' ? 'Deleted' : { $ne: 'Deleted' };
    
    const boms = await BOM.find({ status: queryStatus })
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type')
      .sort({ createdAt: -1 });

    const augmentedBoms = await Promise.all(boms.map(async (bom) => {
      const liveCosts = await calculateBomCosts(bom.components, bom.outputQuantity);
      const bomData = bom.toObject();
      
      bomData.components = bomData.components.map((comp) => {
        const detailed = liveCosts.detailedComponents.find(dc => dc.materialId.toString() === (comp.materialId?._id || comp.materialId).toString());
        return {
          ...comp,
          mpnUsed: detailed ? detailed.mpnUsed : null
        };
      });
      
      bomData.totalCost = liveCosts.totalRecipeCost; 
      bomData.totalRecipeCost = liveCosts.totalRecipeCost;
      bomData.calculatedUnitCost = liveCosts.calculatedUnitCost;
      bomData.hasMissingPrices = liveCosts.hasMissingPrices;
      return bomData;
    }));

    res.status(200).json({ success: true, count: augmentedBoms.length, data: augmentedBoms });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single BOM
// @route   GET /api/boms/:id
// @access  Private
exports.getBOM = async (req, res, next) => {
  try {
    const bom = await BOM.findById(req.params.id)
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type');

    if (!bom) {
      return res.status(404).json({ success: false, error: 'Bill of Materials not found' });
    }

    const liveCosts = await calculateBomCosts(bom.components, bom.outputQuantity);
    const bomData = bom.toObject();
    
    bomData.components = bomData.components.map((comp) => {
      const detailed = liveCosts.detailedComponents.find(dc => dc.materialId.toString() === (comp.materialId?._id || comp.materialId).toString());
      return {
        ...comp,
        mpnUsed: detailed ? detailed.mpnUsed : null
      };
    });

    bomData.totalCost = liveCosts.totalRecipeCost; 
    bomData.totalRecipeCost = liveCosts.totalRecipeCost;
    bomData.calculatedUnitCost = liveCosts.calculatedUnitCost;
    bomData.hasMissingPrices = liveCosts.hasMissingPrices;

    res.status(200).json({ success: true, data: bomData });
  } catch (err) {
    next(err);
  }
};

// Helper function to validate component list integrity (Duplicates + Batched N+1 Exist Check + Cycle Detection)
const validateBOMComponents = async (productId, components, currentBomId = null) => {
  // 1. Check duplicate components within submission
  const seenMaterialIds = new Set();
  
  // 1.5 Prevent Assembly Product from being its own ingredient
  for (const comp of components) {
    if (comp.materialId && comp.materialId.toString() === productId.toString()) {
      return {
        isValid: false,
        statusCode: 400,
        error: 'Assembly Product cannot be an ingredient in its own recipe.'
      };
    }
  }
  for (const comp of components) {
    if (!comp.materialId) continue;
    const matIdStr = comp.materialId.toString();
    if (seenMaterialIds.has(matIdStr)) {
      const dupMaterial = await Material.findById(comp.materialId);
      const name = dupMaterial ? dupMaterial.name : matIdStr;
      return {
        isValid: false,
        statusCode: 400,
        error: `Duplicate component found in BOM submission: Material '${name}' appears more than once.`
      };
    }
    seenMaterialIds.add(matIdStr);
  }

  // 2. Batched existence query (N+1 query optimization)
  const componentIds = components.map(c => c.materialId).filter(Boolean);
  const foundMaterials = await Material.find({ _id: { $in: componentIds } });
  const foundIds = new Set(foundMaterials.map(m => m._id.toString()));
  const missing = componentIds.filter(id => !foundIds.has(id.toString()));

  if (missing.length > 0) {
    return {
      isValid: false,
      statusCode: 404,
      error: `Component material(s) with ID(s) ${missing.join(', ')} not found`
    };
  }

  // 2.5 Validate component material types (cannot be Finished Goods)
  const invalidTypeMaterials = foundMaterials.filter(m => m.type === 'Finished' || m.type === 'Finished Goods');
  if (invalidTypeMaterials.length > 0) {
    const invalidNames = invalidTypeMaterials.map(m => m.name).join(', ');
    return {
      isValid: false,
      statusCode: 400,
      error: `Invalid component material type: Finished goods (${invalidNames}) cannot be used as components in a BOM.`
    };
  }

  // 3. Multi-level cycle detection
  const cycleResult = await detectCycle(productId, components, currentBomId);
  if (cycleResult.hasCycle) {
    const pathStr = cycleResult.cycleNames.join(' → ');
    return {
      isValid: false,
      statusCode: 400,
      error: `Cannot save BOM: Component '${cycleResult.cycleNames[1]}' would create a circular dependency (${pathStr}).`
    };
  }

  return { isValid: true };
};

// @desc    Create BOM
// @route   POST /api/boms
// @access  Private
exports.createBOM = async (req, res, next) => {
  try {
    const { productId, components, outputQuantity, outputUnit } = req.body;

    if (!productId || !components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide productId and a list of component materials' });
    }

    if (!outputQuantity || outputQuantity <= 0) {
      return res.status(400).json({ success: false, error: 'Please provide a valid outputQuantity greater than 0' });
    }
    if (!outputUnit) {
      return res.status(400).json({ success: false, error: 'Please provide an outputUnit' });
    }

    // Verify product exists and is of Finished Good or Semi-Finished type
    const product = await Material.findById(productId);
    if (!product || product.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Target product material not found' });
    }
    if (product.type !== 'Finished' && product.type !== 'Semi-Finished') {
      return res.status(400).json({ success: false, error: 'BOM recipe configurations can only be created for Finished or Semi-Finished Products' });
    }

    // Check if Active BOM already exists for this product
    const existing = await BOM.findOne({ productId, status: { $ne: 'Deleted' } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A Bill of Materials (BOM) already exists for this product' });
    }

    // Validate component integrity (Duplicates, Batched existence, Cycle check)
    const validation = await validateBOMComponents(productId, components);
    if (!validation.isValid) {
      return res.status(validation.statusCode).json({ success: false, error: validation.error });
    }

    // Calculate costs
    const { totalRecipeCost, calculatedUnitCost, hasMissingPrices } = await calculateBomCosts(components, outputQuantity);

    const bom = await BOM.create({ 
      productId, 
      components, 
      outputQuantity,
      outputUnit,
      totalRecipeCost,
      calculatedUnitCost,
      hasMissingPrices,
      status: 'Active' 
    });
    const populated = await BOM.findById(bom._id)
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Update BOM
// @route   PUT /api/boms/:id
// @access  Private
exports.updateBOM = async (req, res, next) => {
  try {
    const { components, outputQuantity, outputUnit } = req.body;
    let bom = await BOM.findById(req.params.id);

    if (!bom || bom.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Bill of Materials not found' });
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide components' });
    }

    if (outputQuantity !== undefined && outputQuantity <= 0) {
      return res.status(400).json({ success: false, error: 'outputQuantity must be greater than 0' });
    }

    // Validate component integrity
    const validation = await validateBOMComponents(bom.productId, components, bom._id);
    if (!validation.isValid) {
      return res.status(validation.statusCode).json({ success: false, error: validation.error });
    }

    // Calculate costs
    const finalOutputQty = outputQuantity !== undefined ? outputQuantity : bom.outputQuantity;
    const { totalRecipeCost, calculatedUnitCost, hasMissingPrices } = await calculateBomCosts(components, finalOutputQty);

    const updateData = { components, totalRecipeCost, calculatedUnitCost, hasMissingPrices };
    if (outputQuantity !== undefined) updateData.outputQuantity = outputQuantity;
    if (outputUnit !== undefined) updateData.outputUnit = outputUnit;

    bom = await BOM.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type');

    res.status(200).json({ success: true, data: bom });
  } catch (err) {
    next(err);
  }
};

  // @desc    Delete BOM (Soft Delete)
  // @route   DELETE /api/boms/:id
  // @access  Private
  exports.deleteBOM = async (req, res, next) => {
    try {
      const bomId = req.params.id;
  
      const bom = await BOM.findById(bomId);
      if (!bom || bom.status === 'Deleted') {
        return res.status(404).json({ success: false, error: 'BOM not found' });
      }
  
      bom.status = 'Deleted';
      await bom.save();
  
      res.status(200).json({ success: true, message: 'BOM deleted successfully', data: {} });
    } catch (err) {
      next(err);
    }
  };

  // @desc    Bulk delete BOMs (Soft Delete)
  // @route   POST /api/boms/bulk-delete
  // @access  Private
  exports.bulkDeleteBOMs = async (req, res, next) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Please provide an array of BOM IDs' });
      }
  
      await BOM.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'Deleted' } }
      );
  
      res.status(200).json({ success: true, message: `${ids.length} BOM(s) soft deleted successfully` });
    } catch (err) {
      next(err);
    }
  };
  
  // @desc    Bulk restore BOMs
  // @route   POST /api/boms/bulk-restore
  // @access  Private
  exports.restoreBOMs = async (req, res, next) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Please provide an array of BOM IDs' });
      }
  
      // Check for conflicts: cannot restore if an Active BOM already exists for the same productId
      const bomsToRestore = await BOM.find({ _id: { $in: ids } });
      
      const errors = [];
      for (const bom of bomsToRestore) {
        const existingActive = await BOM.findOne({ productId: bom.productId, status: 'Active' });
        if (existingActive && !ids.includes(existingActive._id.toString())) {
          errors.push(`Cannot restore BOM ${bom._id}: An active BOM already exists for this product.`);
        }
      }
  
      if (errors.length > 0) {
        return res.status(400).json({ success: false, error: errors.join('\n') });
      }
  
      await BOM.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'Active' } }
      );
  
      res.status(200).json({ success: true, message: `${ids.length} BOM(s) restored successfully` });
    } catch (err) {
      next(err);
    }
  };
