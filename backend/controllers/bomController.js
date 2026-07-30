const BOM = require('../models/BOM');
const Material = require('../models/Material');
const ProductionOrder = require('../models/ProductionOrder');
const MPN = require('../models/MPN');
const { detectCycle } = require('../utils/bomGraph');

// Helper to calculate BOM costs based on current MPN prices
const calculateBomCosts = async (components, outputQuantity) => {
  let totalRecipeCost = 0;
  for (const comp of components) {
    const mpns = await MPN.find({ materialId: comp.materialId, status: 'Active' });
    if (mpns.length > 0) {
      let lowestPrice = Math.min(...mpns.map(m => (typeof m.unitPrice === 'number' ? m.unitPrice : Infinity)));
      if (lowestPrice === Infinity || isNaN(lowestPrice)) lowestPrice = 0;
      totalRecipeCost += (comp.quantity * lowestPrice);
    }
  }
  const calculatedUnitCost = outputQuantity > 0 ? (totalRecipeCost / outputQuantity) : 0;
  return { totalRecipeCost, calculatedUnitCost };
};

// @desc    Get all BOMs
// @route   GET /api/boms
// @access  Private
exports.getBOMs = async (req, res, next) => {
  try {
    const boms = await BOM.find({ status: { $ne: 'Deleted' } })
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: boms.length, data: boms });
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

    if (!bom || bom.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'Bill of Materials not found' });
    }

    // Recalculate live costs on the detail view for real-time accuracy
    const liveCosts = await calculateBomCosts(bom.components, bom.outputQuantity);
    const bomData = bom.toObject();
    bomData.totalCost = liveCosts.totalRecipeCost; // Fallback for existing UI if any
    bomData.totalRecipeCost = liveCosts.totalRecipeCost;
    bomData.calculatedUnitCost = liveCosts.calculatedUnitCost;

    res.status(200).json({ success: true, data: bomData });
  } catch (err) {
    next(err);
  }
};

// Helper function to validate component list integrity (Duplicates + Batched N+1 Exist Check + Cycle Detection)
const validateBOMComponents = async (productId, components, currentBomId = null) => {
  // 1. Check duplicate components within submission
  const seenMaterialIds = new Set();
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
    const { totalRecipeCost, calculatedUnitCost } = await calculateBomCosts(components, outputQuantity);

    const bom = await BOM.create({ 
      productId, 
      components, 
      outputQuantity,
      outputUnit,
      totalRecipeCost,
      calculatedUnitCost,
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
    const { totalRecipeCost, calculatedUnitCost } = await calculateBomCosts(components, finalOutputQty);

    const updateData = { components, totalRecipeCost, calculatedUnitCost };
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

    // Check if referenced in any ProductionOrder
    const linkedPO = await ProductionOrder.findOne({ bomId });
    if (linkedPO) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete BOM: it is linked to active or historical Production Orders.'
      });
    }

    bom.status = 'Deleted';
    await bom.save();

    res.status(200).json({ success: true, message: 'BOM deleted successfully', data: {} });
  } catch (err) {
    next(err);
  }
};
