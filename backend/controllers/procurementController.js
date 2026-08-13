const PurchaseRequest = require('../models/PurchaseRequest');
const MRPRun = require('../models/MRPRun');
const PlanningRequirement = require('../models/PlanningRequirement');
const Sequence = require('../models/Sequence');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Create Purchase Request from MRP Calculation (Procurement Flow)
// @route   POST /api/procurement/create
// @access  Private (Admin, Planner, Inventory Manager, ProcurementManager)
exports.createPurchaseRequestFromMRP = asyncHandler(async (req, res) => {
  const { mrpData, mrpRunId } = req.body;

  // Extract materials & shortage status
  let materials = mrpData?.materials || [];
  let hasShortage = mrpData?.hasShortage;

  let mrpRunDoc = null;
  if (mrpRunId) {
    mrpRunDoc = await MRPRun.findById(mrpRunId);
    if (mrpRunDoc) {
      const requirements = await PlanningRequirement.find({ mrpRunId: mrpRunDoc._id });
      if (requirements.length > 0) {
        materials = requirements.map(r => ({
          materialId: r.materialId,
          materialName: r.materialName,
          materialCode: r.materialCode,
          requiredQty: r.requiredQty,
          availableQty: r.availableQty,
          shortageQty: r.shortageQty,
          action: r.action,
        }));
        hasShortage = mrpRunDoc.summary?.hasShortage || materials.some(m => m.shortageQty > 0);
      }
    }
  }

  // 🔒 STRICT RULE 3: Shortage -> ONLY procurement flow. If no shortage, BLOCK PR creation.
  if (!hasShortage || !materials.some(m => m.shortageQty > 0)) {
    return res.status(400).json({
      success: false,
      error: 'No material shortage detected. Purchase Request is not required for balanced inventory.',
    });
  }

  const createdPRs = [];
  const warehouseId = mrpData?.warehouseId || mrpRunDoc?.warehouseId;

  for (const mat of materials) {
    if ((mat.shortageQty || 0) <= 0) continue;

    let seqDoc = await Sequence.findById('purchaseRequest');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'purchaseRequest', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('purchaseRequest', { $inc: { seq: 1 } }, { new: true });
    }

    const requestNumber = `PR-${seqDoc.seq}`;
    const pr = await PurchaseRequest.create({
      requestNumber,
      materialId: mat.materialId,
      quantity: mat.shortageQty,
      requiredDate: mrpData?.requiredDate || mrpRunDoc?.requiredDate || new Date(Date.now() + 7 * 86400000),
      warehouseId,
      status: 'Pending',
      requestedBy: req.user ? req.user._id : null,
      notes: `Auto-generated procurement request for shortage quantity (${mat.shortageQty} units)`,
    });

    createdPRs.push(pr);
  }

  res.status(201).json({
    success: true,
    message: `Successfully created ${createdPRs.length} Purchase Requests for material shortages.`,
    count: createdPRs.length,
    data: createdPRs,
  });
});
