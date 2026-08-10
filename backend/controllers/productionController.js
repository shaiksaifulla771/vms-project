const mongoose = require('mongoose');
const ProductionOrder = require('../models/ProductionOrder');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const QualityRecord = require('../models/QualityRecord');
const Sequence = require('../models/Sequence');
const asyncHandler = require('../middleware/asyncHandler');
const InventoryLedgerService = require('../services/inventoryLedgerService');

// Helper: Calculate stock availability (MRP planning core)
const performMRPCheck = async (bomId, targetQuantity) => {
  const bom = await BOM.findById(bomId).populate('components.materialId');
  if (!bom) {
    throw new Error('Bill of Materials (BOM) recipe not found');
  }

  const details = [];
  let canProduce = true;

  for (let comp of bom.components) {
    const rawMaterial = comp.materialId;
    const required = comp.quantity * targetQuantity;

    // Aggregate warehouse stock balances
    const stocks = await InventoryItem.find({ materialId: rawMaterial._id });
    const available = stocks.reduce((acc, stock) => acc + (stock.balance - (stock.reservedBalance || 0)), 0);
    const shortfall = Math.max(0, required - available);

    if (shortfall > 0) {
      canProduce = false;
    }

    details.push({
      materialId: rawMaterial._id,
      name: rawMaterial.name,
      code: rawMaterial.code,
      unit: rawMaterial.unit,
      required,
      available,
      shortfall,
      status: shortfall > 0 ? 'Deficit' : 'In Stock'
    });
  }

  return { canProduce, details };
};

// @desc    Calculate MRP requirements (Stock availability planner)
// @route   GET /api/productions/planning/mrp
// @access  Private
exports.getMRPPlanning = asyncHandler(async (req, res, next) => {
  const { productId, quantity } = req.query;

  if (!productId || !quantity) {
    return res.status(400).json({ success: false, error: 'Please provide productId and target quantity' });
  }

  const targetQty = parseFloat(quantity);
  if (isNaN(targetQty) || targetQty <= 0) {
    return res.status(400).json({ success: false, error: 'Target quantity must be a positive number' });
  }

  const bom = await BOM.findOne({ productId, status: { $ne: 'Deleted' } });
  if (!bom) {
    return res.status(404).json({
      success: false,
      error: 'No Bill of Materials (BOM) recipe found for this product. Configure a BOM recipe first.'
    });
  }

  const mrp = await performMRPCheck(bom._id, targetQty);
  res.status(200).json({ success: true, data: mrp });
});

// @desc    Get all production orders
// @route   GET /api/productions
// @access  Private
exports.getProductionOrders = asyncHandler(async (req, res, next) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.isPerformanceTest) query.isPerformanceTest = req.query.isPerformanceTest === 'true';

  const orders = await ProductionOrder.find(query)
    .populate('bomId', 'name version')
    .populate('productId', 'name code')
    .sort('-createdAt');
    
  res.status(200).json({ success: true, count: orders.length, data: orders });
});

// @desc    Get single production order
// @route   GET /api/productions/:id
// @access  Private
exports.getProductionOrderById = asyncHandler(async (req, res, next) => {
  const order = await ProductionOrder.findById(req.params.id)
    .populate('bomId')
    .populate('productId')
    .populate('sourceWarehouseId')
    .populate('destinationWarehouseId')
    .populate('components.mpnId');

  if (!order) return res.status(404).json({ success: false, error: 'Production order not found' });
  res.status(200).json({ success: true, data: order });
});

// @desc    Create production order
// @route   POST /api/productions
// @access  Private
exports.createProductionOrder = asyncHandler(async (req, res, next) => {
  const { bomId, targetQuantity, sourceWarehouseId, destinationWarehouseId, batchNumber, isPerformanceTest, testRunId } = req.body;

  // Validate BOM
  const bom = await BOM.findById(bomId).populate('components.mpnId');
  if (!bom) return res.status(404).json({ success: false, error: 'BOM not found' });

  // Get Sequence
  let seqDoc = await Sequence.findById('productionOrder');
  if (!seqDoc) {
    seqDoc = await Sequence.create({ _id: 'productionOrder', seq: 1000 });
  } else {
    seqDoc = await Sequence.findByIdAndUpdate('productionOrder', { $inc: { seq: 1 } }, { new: true });
  }
  const prdNumber = `PRD-${seqDoc.seq}`;

  // Calculate Expected Cost
  let expectedCost = 0;
  const components = bom.components.map(comp => {
    const effectivePrice = comp.mpnId.latestPrice || 0; 
    const expectedQty = (comp.qty / bom.batchSize) * targetQuantity;
    const compCost = (expectedQty * effectivePrice) / (1 - (comp.lossPercent / 100));
    expectedCost += compCost;

    return {
      mpnId: comp.mpnId._id,
      expectedQuantity: expectedQty,
      lossPercent: comp.lossPercent,
      expectedCost: compCost
    };
  });

  const order = await ProductionOrder.create({
    prdNumber,
    bomId,
    productId: bom.productId,
    sourceWarehouseId,
    destinationWarehouseId,
    targetQuantity,
    batchNumber: batchNumber || prdNumber,
    status: 'Draft',
    components,
    expectedCost,
    createdBy: req.user ? req.user.id : null,
    isPerformanceTest: isPerformanceTest || false,
    testRunId
  });

  res.status(201).json({ success: true, data: order });
});

// @desc    Submit for Approval
// @route   POST /api/productions/:id/submit
// @access  Private
exports.submitForApproval = asyncHandler(async (req, res, next) => {
  const order = await ProductionOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (order.status !== 'Draft') return res.status(400).json({ success: false, error: 'Only Draft orders can be submitted' });

  order.status = 'Pending Approval';
  order.updatedBy = req.user ? req.user.id : null;
  await order.save();
  res.status(200).json({ success: true, data: order });
});

// @desc    Approve Production Order (Reserves Inventory)
// @route   POST /api/productions/:id/approve
// @access  Private (Manager only)
exports.approveProductionOrder = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);

  try {
    const order = await ProductionOrder.findById(req.params.id).session(session);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'Pending Approval') throw new Error('Order must be in Pending Approval status');

    // Soft Reserve Inventory
    for (const comp of order.components) {
      const mpn = await mongoose.model('MPN').findById(comp.mpnId).session(session);
      if(!mpn) throw new Error(`MPN not found for ${comp.mpnId}`);

      const inventoryItem = await InventoryItem.findOne({ 
        materialId: mpn.materialId, 
        warehouseId: order.sourceWarehouseId 
      }).session(session);

      if (!inventoryItem) throw new Error(`Inventory record not found for material ${mpn.materialId} in warehouse`);
      
      const available = inventoryItem.balance - inventoryItem.reservedBalance;
      if (available < comp.expectedQuantity) {
        throw new Error(`Insufficient inventory for material ${mpn.materialId}. Needed: ${comp.expectedQuantity}, Available: ${available}`);
      }

      inventoryItem.reservedBalance += comp.expectedQuantity;
      await inventoryItem.save({ session });
    }

    order.status = 'Approved';
    order.approvedBy = req.user ? req.user.id : null;
    await order.save({ session });

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    await abortSafeTransaction(session);
    res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// @desc    Allocate Material (Hard Lock)
// @route   POST /api/productions/:id/allocate
// @access  Private
exports.allocateMaterial = asyncHandler(async (req, res, next) => {
  const order = await ProductionOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (order.status !== 'Approved') return res.status(400).json({ success: false, error: 'Order must be Approved' });

  order.status = 'Material Allocated';
  order.updatedBy = req.user ? req.user.id : null;
  await order.save();
  res.status(200).json({ success: true, data: order });
});

// @desc    Start Production
// @route   PATCH /api/productions/:id/start
// @access  Private (Operator)
exports.startProduction = asyncHandler(async (req, res, next) => {
  const order = await ProductionOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (!['Scheduled', 'Approved', 'Material Allocated', 'Draft', 'Pending Approval'].includes(order.status)) {
    return res.status(400).json({ success: false, error: `Order in status ${order.status} cannot be started` });
  }

  order.status = 'In Progress';
  order.startedBy = req.user ? req.user.id : null;
  await order.save();
  res.status(200).json({ success: true, data: order });
});

// @desc    Send to QC (Log Actuals)
// @route   POST /api/productions/:id/qc
// @access  Private
exports.sendToQC = asyncHandler(async (req, res, next) => {
  const { actualQuantity, scrapQuantity, wasteQuantity, componentsActuals } = req.body;
  
  const session = await mongoose.startSession();
  startSafeTransaction(session);

  try {
    const order = await ProductionOrder.findById(req.params.id).session(session);
    if (!order) throw new Error('Order not found');
    if (!['In Production', 'In Progress'].includes(order.status)) throw new Error('Order must be in production');

    order.actualQuantity = actualQuantity;
    order.scrapQuantity = scrapQuantity || 0;
    order.wasteQuantity = wasteQuantity || 0;
    
    // Update component actuals
    if (componentsActuals && Array.isArray(componentsActuals)) {
      componentsActuals.forEach(actual => {
        const comp = order.components.find(c => (c.mpnId && c.mpnId.toString() === actual.mpnId?.toString()) || (c.materialId && c.materialId.toString() === actual.materialId?.toString()));
        if (comp) {
          comp.actualQuantity = actual.actualQuantity;
          const effectivePrice = comp.expectedCost / (comp.expectedQuantity || 1); 
          comp.actualCost = comp.actualQuantity * effectivePrice;
        }
      });
    }

    order.actualCost = order.components.reduce((sum, c) => sum + (c.actualCost || 0), 0);
    order.costVariance = order.expectedCost - order.actualCost;
    order.yieldPercent = (order.actualQuantity / order.targetQuantity) * 100;

    order.status = 'Quality Check';
    await order.save({ session });

    await QualityRecord.create([{
      productionOrderId: order._id,
      status: 'Pending',
      inspectedBy: req.user ? req.user.id : null,
    }], { session });

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    await abortSafeTransaction(session);
    res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// @desc    QC Result / Complete Production
// @route   PATCH /api/productions/:id/complete
// @access  Private (QC/Admin)
exports.completeProduction = asyncHandler(async (req, res, next) => {
  const { qcStatus = 'Passed', qcNotes } = req.body; // 'Passed' or 'Rejected'

  const session = await mongoose.startSession();
  startSafeTransaction(session);

  try {
    const order = await ProductionOrder.findById(req.params.id).session(session);
    if (!order) throw new Error('Order not found');
    if (!['In Production', 'In Progress', 'Quality Check', 'Scheduled', 'Approved', 'Material Allocated'].includes(order.status)) {
      throw new Error(`Order in status ${order.status} cannot be completed`);
    }

    const qr = await QualityRecord.findOne({ productionOrderId: order._id }).session(session);
    if (qr) {
      qr.status = qcStatus;
      qr.notes = qcNotes || '';
      await qr.save({ session });
    }

    if (qcStatus === 'Passed') {
      order.status = 'Completed';
      
      for (const comp of order.components || []) {
        let matId = comp.materialId;
        if (!matId && comp.mpnId) {
          const mpn = await mongoose.model('MPN').findById(comp.mpnId);
          if (mpn) matId = mpn.materialId;
        }

        if (matId) {
          const consumedQty = comp.actualQuantity || comp.expectedQuantity || 1;
          try {
            await InventoryLedgerService.recordTransaction({
              materialId: matId,
              warehouseId: order.sourceWarehouseId,
              quantity: consumedQty,
              type: 'Issue',
              referenceId: order.prdNumber,
              sourceDocType: 'ProductionOrder',
              sourceDocId: order._id.toString(),
              reason: `BOM raw material consumption for order ${order.prdNumber}`,
              userId: req.user ? req.user.id : null,
            });
          } catch (err) {
            console.warn(`[Production Complete] Consumption transaction warning: ${err.message}`);
          }
        }
      }

      // Record Finished Goods Production Receipt
      try {
        const prodQty = order.actualQuantity || order.targetQuantity || 1;
        await InventoryLedgerService.recordTransaction({
          materialId: order.productId,
          warehouseId: order.destinationWarehouseId || order.sourceWarehouseId,
          batchNumber: order.batchNumber || order.prdNumber,
          quantity: prodQty,
          type: 'production',
          referenceId: order.prdNumber,
          sourceDocType: 'ProductionOrder',
          sourceDocId: order._id.toString(),
          reason: `Finished Goods production receipt for order ${order.prdNumber}`,
          userId: req.user ? req.user.id : null,
        });
      } catch (err) {
        console.warn(`[Production Complete] FG Receipt transaction warning: ${err.message}`);
      }
    } else if (qcStatus === 'Rejected') {
      order.status = 'Rejected';
      for (const comp of order.components || []) {
        let matId = comp.materialId;
        if (!matId && comp.mpnId) {
          const mpn = await mongoose.model('MPN').findById(comp.mpnId);
          if (mpn) matId = mpn.materialId;
        }

        if (matId) {
          const scrapQty = comp.actualQuantity || comp.expectedQuantity || 1;
          try {
            await InventoryLedgerService.recordTransaction({
              materialId: matId,
              warehouseId: order.sourceWarehouseId,
              quantity: scrapQty,
              type: 'Scrap',
              referenceId: order.prdNumber,
              sourceDocType: 'ProductionOrder',
              sourceDocId: order._id.toString(),
              reason: `QC Rejected scrap for order ${order.prdNumber}`,
              userId: req.user ? req.user.id : null,
            });
          } catch (err) {
            console.warn(`[Production Complete] Scrap transaction warning: ${err.message}`);
          }
        }
      }
    }

    order.completedBy = req.user ? req.user.id : null;
    await order.save({ session });

    // Also update linked ProductionPlan if present
    if (order.planId) {
      const plan = await mongoose.model('ProductionPlan').findById(order.planId).session(session);
      if (plan) {
        plan.status = 'Completed';
        await plan.save({ session });
      }
    }

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    await abortSafeTransaction(session);
    res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});
