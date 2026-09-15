const mongoose = require('mongoose');
const Material = require('../models/Material');
const InventoryItem = require('../models/InventoryItem');
const PurchaseRequirement = require('../models/PurchaseRequirement');
const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryTransaction = require('../models/InventoryTransaction');
const Vendor = require('../models/Vendor');
const Warehouse = require('../models/Warehouse');
const Sequence = require('../models/Sequence');
const { eventBus, EVENTS } = require('../events/eventBus');
const { writeAuditLog } = require('./auditService');
const { nextSeqNumber } = require('./sequenceService');

class ProcurementAutomationService {
  /**
   * Evaluates reorder points for materials across warehouses/sites
   * Generates draft PurchaseRequirements when stock dips below reorder thresholds.
   */
  static async evaluateReorderPoints(params = {}) {
    const { siteId, warehouseId, triggeredBy } = params;

    // 1. Find all active BUY materials with defined reorderPoint > 0
    const materials = await Material.find({
      status: 'Active',
      makeOrBuy: { $in: ['BUY', 'buy'] },
      reorderPoint: { $gt: 0 },
    }).lean();

    if (materials.length === 0) {
      return { evaluatedCount: 0, requirementsCreated: 0, requirements: [] };
    }

    const materialIds = materials.map(m => m._id);

    // 2. Fetch inventory balances
    const invQuery = { materialId: { $in: materialIds } };
    if (warehouseId) invQuery.warehouseId = warehouseId;
    if (siteId) invQuery.siteId = siteId;

    const inventoryDocs = await InventoryItem.find(invQuery).lean();
    const stockMap = {};
    inventoryDocs.forEach(item => {
      const k = item.materialId.toString();
      if (!stockMap[k]) stockMap[k] = 0;
      const avail = Math.max(0, (item.onHand || 0) - (item.reserved || 0));
      stockMap[k] += avail;
    });

    // 3. Fetch open PO supply
    const openPOs = await PurchaseOrder.find({
      isDeleted: { $ne: true },
      status: { $in: ['Approved', 'Ordered', 'Partially Received'] },
      'materials.materialId': { $in: materialIds },
    }).lean();

    const openSupplyMap = {};
    openPOs.forEach(po => {
      po.materials.forEach(line => {
        const k = line.materialId.toString();
        if (!openSupplyMap[k]) openSupplyMap[k] = 0;
        const rem = Math.max(0, (line.quantity || 0) - (line.receivedQuantity || 0));
        openSupplyMap[k] += rem;
      });
    });

    // 4. Fetch existing open PRs to prevent duplicate creation
    const existingOpenPRs = await PurchaseRequirement.find({
      materialId: { $in: materialIds },
      status: { $in: ['DRAFT', 'OPEN'] },
    }).select('materialId').lean();
    const openPRMatSet = new Set(existingOpenPRs.map(p => p.materialId.toString()));

    const createdRequirements = [];

    for (const mat of materials) {
      const matIdStr = mat._id.toString();
      if (openPRMatSet.has(matIdStr)) continue; // Already has open PR

      const currentAvailable = stockMap[matIdStr] || 0;
      const onOrderSupply = openSupplyMap[matIdStr] || 0;
      const totalEffectiveStock = currentAvailable + onOrderSupply;

      if (totalEffectiveStock <= mat.reorderPoint) {
        // Calculate requirement quantity respecting MOQ & Lot Size
        const deficit = Math.max(0, (mat.reorderQuantity || (mat.reorderPoint * 2)) - totalEffectiveStock);
        const moq = mat.moq || mat.minOrderQty || 1;
        const lotSize = mat.lotSize || 1;
        const baseQty = Math.max(deficit, moq);
        const optimalQty = Math.ceil(baseQty / lotSize) * lotSize;

        const reqNumber = await nextSeqNumber('purchaseRequirement', 'PR');
        const reqDate = new Date(Date.now() + (mat.leadTimeDays || 7) * 86400000);

        const pr = await PurchaseRequirement.create({
          requirementNumber: reqNumber,
          materialId: mat._id,
          materialCode: mat.code,
          materialName: mat.name,
          quantity: optimalQty,
          unit: mat.unit || 'pcs',
          requiredDate: reqDate,
          suggestedVendor: mat.defaultVendorId || null,
          estimatedUnitPrice: mat.basePrice || 0,
          estimatedTotalCost: Math.round((optimalQty * (mat.basePrice || 0)) * 100) / 100,
          warehouseId: warehouseId || null,
          siteId: siteId || null,
          sourceKey: `ROP-${mat.code}-${Date.now()}`,
          status: 'OPEN',
          notes: `Automated Reorder Point Trigger: Effective Stock (${totalEffectiveStock}) <= Reorder Point (${mat.reorderPoint})`,
          createdBy: triggeredBy || null,
        });

        createdRequirements.push(pr);
      }
    }

    return {
      evaluatedCount: materials.length,
      requirementsCreated: createdRequirements.length,
      requirements: createdRequirements,
    };
  }

  /**
   * Converts multiple PurchaseRequirements into PurchaseOrders, grouping by Vendor.
   */
  static async bulkConvertRequirementsToPO(params = {}) {
    const {
      requirementIds = [],
      overrideVendorId,
      destinationWarehouseId,
      siteId,
      expectedDeliveryDate,
      userId,
      correlationId,
    } = params;

    if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
      throw new Error('Please provide an array of requirementIds to convert');
    }

    const prs = await PurchaseRequirement.find({
      _id: { $in: requirementIds },
      status: { $in: ['OPEN', 'APPROVED', 'DRAFT'] },
    }).populate('materialId').lean();

    if (prs.length === 0) {
      throw new Error('No open/approved purchase requirements found matching the provided IDs');
    }

    // Group PRs by vendor
    const vendorGroups = {};
    for (const pr of prs) {
      let resolvedVendorId = overrideVendorId || pr.suggestedVendor;
      if (!resolvedVendorId && pr.materialId && pr.materialId.defaultVendorId) {
        resolvedVendorId = pr.materialId.defaultVendorId;
      }
      if (!resolvedVendorId) {
        const defaultVendor = await Vendor.findOne({ status: 'Active' }).select('_id').lean();
        if (defaultVendor) resolvedVendorId = defaultVendor._id;
      }

      if (!resolvedVendorId) {
        throw new Error(`Cannot convert requirement ${pr.requirementNumber}: No active vendor assigned.`);
      }

      const vKey = resolvedVendorId.toString();
      if (!vendorGroups[vKey]) {
        vendorGroups[vKey] = {
          vendorId: resolvedVendorId,
          requirements: [],
        };
      }
      vendorGroups[vKey].requirements.push(pr);
    }

    const createdPOs = [];

    for (const vKey of Object.keys(vendorGroups)) {
      const group = vendorGroups[vKey];
      const poNumber = await nextSeqNumber('purchaseOrder', 'PO');

      let totalAmount = 0;
      const materials = [];
      const sourceReqIds = [];

      for (const pr of group.requirements) {
        const unitPrice = Number(pr.estimatedUnitPrice || pr.materialId?.basePrice || 10);
        const qty = Number(pr.quantity);
        totalAmount += Math.round((qty * unitPrice) * 100) / 100;

        materials.push({
          materialId: pr.materialId?._id || pr.materialId,
          quantity: qty,
          unitPrice,
          receivedQuantity: 0,
          rejectedQuantity: 0,
          lineStatus: 'OPEN',
          notes: `From PR ${pr.requirementNumber}`,
        });

        sourceReqIds.push(pr._id);
      }

      // Resolve warehouse & site
      const targetWhId = destinationWarehouseId || group.requirements[0].warehouseId || null;
      let targetSiteId = siteId || group.requirements[0].siteId || null;
      if (targetWhId && !targetSiteId) {
        const whDoc = await Warehouse.findById(targetWhId).select('siteId').lean();
        if (whDoc && whDoc.siteId) targetSiteId = whDoc.siteId;
      }

      const poDate = expectedDeliveryDate || group.requirements[0].requiredDate || new Date(Date.now() + 7 * 86400000);

      const po = await PurchaseOrder.create({
        poNumber,
        vendorId: group.vendorId,
        siteId: targetSiteId,
        destinationWarehouseId: targetWhId,
        warehouseId: targetWhId,
        materials,
        totalAmount,
        expectedDeliveryDate: poDate,
        orderDate: new Date(),
        sourceType: 'PURCHASE_REQUIREMENT',
        sourceRequirementIds: sourceReqIds,
        requestedBy: userId || null,
        status: 'Pending',
      });

      // Update PRs to CONVERTED_TO_PO
      await PurchaseRequirement.updateMany(
        { _id: { $in: sourceReqIds } },
        {
          $set: {
            status: 'CONVERTED_TO_PO',
            convertedPurchaseOrderId: po._id,
            updatedAt: new Date(),
          }
        }
      );

      // Log and Emit Events
      if (userId) {
        await writeAuditLog(
          null,
          'PurchaseOrder',
          po._id,
          'CREATE',
          null,
          { poNumber, vendorId: group.vendorId, totalAmount, sourceRequirements: sourceReqIds.length },
          userId,
          correlationId
        );
      }

      eventBus.emit(EVENTS.PO_CREATED, {
        poId: po._id,
        poNumber,
        vendorId: group.vendorId,
        materials: po.materials,
        totalAmount,
        requestedBy: userId,
        correlationId,
      });

      createdPOs.push(po);
    }

    return {
      ordersCreatedCount: createdPOs.length,
      requirementsConvertedCount: prs.length,
      orders: createdPOs,
    };
  }

  /**
   * Process a Goods Receipt Note (GRN) with exact warehouse scoping and partial receipt tracking.
   */
  static async recordGoodsReceipt(params = {}) {
    const {
      poId,
      warehouseId,
      siteId,
      items = [], // [{ materialId, receivedQuantity, rejectedQuantity, lotNumber, batchNumber, locationBin }]
      receivedBy,
      notes = '',
      correlationId,
    } = params;

    const po = await PurchaseOrder.findById(poId);
    if (!po) {
      throw new Error('Purchase Order not found');
    }

    if (!['Approved', 'Ordered', 'Partially Received'].includes(po.status)) {
      throw new Error(`Cannot receive goods against PO #${po.poNumber}. Current status is '${po.status}'.`);
    }

    const targetWarehouseId = warehouseId || po.destinationWarehouseId || po.warehouseId;
    if (!targetWarehouseId) {
      throw new Error('Destination Warehouse is required to receive inventory.');
    }

    // Resolve site
    let targetSiteId = siteId || po.siteId;
    if (!targetSiteId) {
      const wh = await Warehouse.findById(targetWarehouseId).select('siteId').lean();
      if (wh && wh.siteId) targetSiteId = wh.siteId;
    }

    const grnNumber = await nextSeqNumber('goodsReceipt', 'GRN');
    const grnItems = [];

    // Process each received line
    for (const receiptItem of items) {
      const matIdStr = (receiptItem.materialId?._id || receiptItem.materialId).toString();
      const rcvdQty = Number(receiptItem.receivedQuantity || 0);
      const rejectedQty = Number(receiptItem.rejectedQuantity || 0);

      if (rcvdQty <= 0 && rejectedQty <= 0) continue;

      const poLine = po.materials.find(m => m.materialId.toString() === matIdStr);
      if (!poLine) {
        throw new Error(`Material ${matIdStr} does not belong to PO #${po.poNumber}`);
      }

      // Update PO line received quantity
      poLine.receivedQuantity = (poLine.receivedQuantity || 0) + rcvdQty;
      poLine.rejectedQuantity = (poLine.rejectedQuantity || 0) + rejectedQty;

      if (poLine.receivedQuantity >= poLine.quantity) {
        poLine.lineStatus = 'RECEIVED';
      } else {
        poLine.lineStatus = 'PARTIALLY_RECEIVED';
      }

      // 1. Find or create scoped InventoryItem (exact match on materialId + warehouseId)
      let inventoryDoc = await InventoryItem.findOne({
        materialId: poLine.materialId,
        warehouseId: targetWarehouseId,
      });

      if (!inventoryDoc) {
        inventoryDoc = await InventoryItem.create({
          materialId: poLine.materialId,
          warehouseId: targetWarehouseId,
          siteId: targetSiteId,
          onHand: 0,
          reserved: 0,
          available: 0,
          batchNumber: receiptItem.batchNumber || '',
          lotNumber: receiptItem.lotNumber || '',
          locationBin: receiptItem.locationBin || '',
        });
      }

      // Increment physical stock
      inventoryDoc.onHand = Math.round(((inventoryDoc.onHand || 0) + rcvdQty) * 10000) / 10000;
      inventoryDoc.available = Math.max(0, Math.round(((inventoryDoc.onHand || 0) - (inventoryDoc.reserved || 0)) * 10000) / 10000);
      inventoryDoc.updatedAt = new Date();
      await inventoryDoc.save();

      // 2. Create structured InventoryTransaction
      await InventoryTransaction.create({
        materialId: poLine.materialId,
        warehouseId: targetWarehouseId,
        siteId: targetSiteId,
        quantity: rcvdQty,
        type: 'purchase',
        referenceId: po._id.toString(),
        batchNumber: receiptItem.batchNumber || '',
        lotNumber: receiptItem.lotNumber || '',
        notes: `GRN #${grnNumber} against PO #${po.poNumber}. Notes: ${notes}`,
        performedBy: receivedBy || null,
        createdAt: new Date(),
      });

      grnItems.push({
        materialId: poLine.materialId,
        receivedQuantity: rcvdQty,
        rejectedQuantity: rejectedQty,
        lotNumber: receiptItem.lotNumber || '',
        batchNumber: receiptItem.batchNumber || '',
        locationBin: receiptItem.locationBin || '',
      });

      eventBus.emit(EVENTS.INVENTORY_RECEIVED, {
        materialId: poLine.materialId,
        quantity: rcvdQty,
        warehouseId: targetWarehouseId,
        siteId: targetSiteId,
        poId: po._id,
        grnNumber,
        correlationId,
      });
    }

    // Determine overall PO status
    const allReceived = po.materials.every(m => (m.receivedQuantity || 0) >= m.quantity);
    po.status = allReceived ? 'Received' : 'Partially Received';

    po.grnHistory.push({
      grnNumber,
      receivedAt: new Date(),
      receivedBy: receivedBy || null,
      warehouseId: targetWarehouseId,
      items: grnItems,
      notes,
    });

    await po.save();

    if (allReceived) {
      eventBus.emit(EVENTS.PO_RECEIVED, {
        poId: po._id,
        poNumber: po.poNumber,
        receivedBy,
        correlationId,
      });
    }

    return {
      grnNumber,
      poNumber: po.poNumber,
      status: po.status,
      receivedItemsCount: grnItems.length,
      po,
    };
  }
}

module.exports = ProcurementAutomationService;
