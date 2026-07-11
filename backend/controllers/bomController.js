const BOM = require('../models/BOM');
const Material = require('../models/Material');
const ProductionOrder = require('../models/ProductionOrder');

// @desc    Get all BOMs
// @route   GET /api/boms
// @access  Private
exports.getBOMs = async (req, res, next) => {
  try {
    const boms = await BOM.find()
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

    if (!bom) {
      return res.status(404).json({ success: false, error: 'Bill of Materials not found' });
    }

    res.status(200).json({ success: true, data: bom });
  } catch (err) {
    next(err);
  }
};

// @desc    Create BOM
// @route   POST /api/boms
// @access  Private
exports.createBOM = async (req, res, next) => {
  try {
    const { productId, components } = req.body;

    if (!productId || !components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide productId and a list of component materials' });
    }

    // Verify product exists and is of Finished Good type
    const product = await Material.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Target product material not found' });
    }
    if (product.type !== 'Finished' && product.type !== 'Semi-Finished') {
      return res.status(400).json({ success: false, error: 'BOM recipe configurations can only be created for Finished or Semi-Finished Products' });
    }

    // Check if BOM already exists for this product
    const existing = await BOM.findOne({ productId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A Bill of Materials (BOM) already exists for this product' });
    }

    // Validate component integrity (no recursive links, components exist)
    for (let comp of components) {
      if (comp.materialId.toString() === productId.toString()) {
        return res.status(400).json({ success: false, error: 'A product cannot be specified as a raw component of its own assembly BOM' });
      }
      const compMaterial = await Material.findById(comp.materialId);
      if (!compMaterial) {
        return res.status(404).json({ success: false, error: `Component material with ID ${comp.materialId} not found` });
      }
    }

    const bom = await BOM.create({ productId, components });
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
    const { components } = req.body;
    let bom = await BOM.findById(req.params.id);

    if (!bom) {
      return res.status(404).json({ success: false, error: 'Bill of Materials not found' });
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide components' });
    }

    // Validate component integrity
    for (let comp of components) {
      if (comp.materialId.toString() === bom.productId.toString()) {
        return res.status(400).json({ success: false, error: 'A product cannot be specified as a raw component of its own assembly BOM' });
      }
      const compMaterial = await Material.findById(comp.materialId);
      if (!compMaterial) {
        return res.status(404).json({ success: false, error: `Component material with ID ${comp.materialId} not found` });
      }
    }

    bom = await BOM.findByIdAndUpdate(
      req.params.id,
      { components },
      { new: true, runValidators: true }
    )
      .populate('productId', 'name code unit type')
      .populate('components.materialId', 'name code unit type');

    res.status(200).json({ success: true, data: bom });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete BOM
// @route   DELETE /api/boms/:id
// @access  Private
exports.deleteBOM = async (req, res, next) => {
  try {
    const bomId = req.params.id;

    // Check if referenced in any ProductionOrder
    const linkedPO = await ProductionOrder.findOne({ bomId });
    if (linkedPO) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete BOM: it is linked to active or historical Production Orders.'
      });
    }

    const bom = await BOM.findByIdAndDelete(bomId);
    if (!bom) {
      return res.status(404).json({ success: false, error: 'BOM not found' });
    }

    res.status(200).json({ success: true, message: 'BOM deleted successfully', data: {} });
  } catch (err) {
    next(err);
  }
};
