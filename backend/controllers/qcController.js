const QualityRecord = require('../models/QualityRecord');
const ProductionOrder = require('../models/ProductionOrder');
const InventoryLedgerService = require('../services/inventoryLedgerService');

// GET /api/qc/inspections — List all quality inspections
exports.getInspections = async (req, res) => {
  try {
    const inspections = await QualityRecord.find()
      .populate({
        path: 'productionOrderId',
        populate: [
          { path: 'productId', select: 'name code unit' },
          { path: 'destinationWarehouseId', select: 'name code' }
        ]
      })
      .populate('inspectedBy', 'username email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: inspections.length, data: inspections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/qc/inspections/:id/process — Process QC Pass or Fail decision with inventory transactions
exports.processQCInspection = async (req, res) => {
  try {
    const { status, notes, defectType, actionTaken } = req.body; // 'Passed', 'Rejected', 'QC Hold'
    
    const inspection = await QualityRecord.findById(req.params.id);
    if (!inspection) return res.status(404).json({ success: false, error: 'Quality record not found' });

    const order = await ProductionOrder.findById(inspection.productionOrderId);
    if (!order) return res.status(404).json({ success: false, error: 'Associated Production Order not found' });

    inspection.status = status;
    inspection.notes = notes || '';
    if (defectType) inspection.defectType = defectType;
    if (actionTaken) inspection.actionTaken = actionTaken;
    inspection.inspectedBy = req.user ? req.user._id : inspection.inspectedBy;
    await inspection.save();

    const producedQty = order.actualQuantity || order.targetQuantity;

    if (status === 'Passed') {
      order.status = 'Completed';
      await order.save();

      // Release from Quarantine / QC-Hold to Finished Goods Available Stock
      await InventoryLedgerService.recordTransaction({
        materialId: order.productId,
        warehouseId: order.destinationWarehouseId,
        batchNumber: order.batchNumber || order.prdNumber,
        quantity: producedQty,
        type: 'QC Release',
        referenceId: order.prdNumber,
        sourceDocType: 'QCInspection',
        sourceDocId: inspection._id.toString(),
        reason: `QC Passed for batch ${order.batchNumber || order.prdNumber}`,
        userId: req.user ? req.user._id : null,
      });

    } else if (status === 'Rejected' || status === 'Failed') {
      order.status = 'Rejected';
      await order.save();

      // Transfer to QC Hold / Scrap
      await InventoryLedgerService.recordTransaction({
        materialId: order.productId,
        warehouseId: order.destinationWarehouseId,
        batchNumber: order.batchNumber || order.prdNumber,
        quantity: producedQty,
        type: 'QC Hold',
        referenceId: order.prdNumber,
        sourceDocType: 'QCInspection',
        sourceDocId: inspection._id.toString(),
        reason: `QC Failed/Rejected: ${notes || 'Defect detected'}`,
        userId: req.user ? req.user._id : null,
      });
    }

    res.json({ success: true, inspection, order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
