const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const QualityRecord = require('../models/QualityRecord');
const { generatePDFReport } = require('../utils/pdfGenerator');

// Helper to compile ERP counts and build exactly 6 Manufacturing insights
const compileERPMetrics = async () => {
  const totalMaterials = await Material.countDocuments();
  const rawMaterials = await Material.countDocuments({ type: 'Raw' });
  const finishedGoods = await Material.countDocuments({ type: 'Finished' });

  const totalBOMs = await BOM.countDocuments();

  // Stock values
  const stockItems = await InventoryItem.find();
  const totalStockQuantity = stockItems.reduce((sum, item) => sum + (item.balance || 0), 0);
  const materialsWithStock = stockItems.filter(item => item.balance > 0).length;

  // Purchases
  const totalPOs = await PurchaseOrder.countDocuments();
  const approvedPOs = await PurchaseOrder.countDocuments({ status: 'Approved' });
  const receivedPOs = await PurchaseOrder.countDocuments({ status: 'Received' });
  const pendingPOs = await PurchaseOrder.countDocuments({ status: 'Pending' });

  const receivedOrders = await PurchaseOrder.find({ status: 'Received' });
  const totalProcurementSpend = receivedOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);

  const pendingOrders = await PurchaseOrder.find({ status: 'Pending' });
  const pendingProcurementSpend = pendingOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);

  // Productions
  const totalProductions = await ProductionOrder.countDocuments();
  const completedProductions = await ProductionOrder.countDocuments({ status: 'Completed' });
  const checkedProductions = await ProductionOrder.countDocuments({ status: 'QC Checked' });

  // QC inspection records
  const totalQCInspections = await QualityRecord.countDocuments();
  const passedQCInspections = await QualityRecord.countDocuments({ status: 'Passed' });
  const failedQCInspections = await QualityRecord.countDocuments({ status: 'Failed' });

  // Compute percentages
  const qcPassRate = totalQCInspections > 0 
    ? ((passedQCInspections / totalQCInspections) * 100).toFixed(1) 
    : '100.0';
  const stockCoverage = totalMaterials > 0 
    ? ((materialsWithStock / totalMaterials) * 100).toFixed(1) 
    : '0';
  const bomCoverage = finishedGoods > 0 
    ? ((totalBOMs / finishedGoods) * 100).toFixed(1) 
    : '100.0';

  // Build exactly 6 Manufacturing insights
  const insights = [
    {
      title: 'Warehouse Material Stock Coverage',
      description: `Active balances are recorded for ${materialsWithStock} out of ${totalMaterials} total master materials (${stockCoverage}% warehouse coverage). Replenishing empty slots secures manufacturing continuity.`
    },
    {
      title: 'Bill of Materials Configuration Status',
      description: `BOM recipes are configured for ${totalBOMs} out of ${finishedGoods} finished product profiles (${bomCoverage}% configuration rate). Verify that all recipes match current engineering drawings.`
    },
    {
      title: 'Quality Assurance Compliance Rate',
      description: `Quality control inspections have checked ${totalQCInspections} manufacturing batches with a ${qcPassRate}% pass rate (${passedQCInspections} passed, ${failedQCInspections} failed). A stable pass rate minimizes rework costs.`
    },
    {
      title: 'Procurement Investment Spend',
      description: `Total procurement expenditure on received goods stands at $${totalProcurementSpend.toLocaleString()} across ${receivedPOs} finalized POs. Tracking spend aids in vendor price renegotiation.`
    },
    {
      title: 'Pending Approvals Procurement Exposure',
      description: `There are ${pendingPOs} pending purchase orders awaiting manager authorization, representing a cash flow commitment of $${pendingProcurementSpend.toLocaleString()}.`
    },
    {
      title: 'Manufacturing Batch Operations Distribution',
      description: `Out of ${totalProductions} production orders created in this period, ${completedProductions} are finished, and ${checkedProductions} are QC-gated and stocked in inventory.`
    }
  ];

  return {
    summary: {
      totalMaterials,
      rawMaterials,
      finishedGoods,
      totalBOMs,
      totalStockQuantity,
      materialsWithStock,
      totalPOs,
      receivedPOs,
      pendingPOs,
      totalProcurementSpend,
      pendingProcurementSpend,
      totalProductions,
      completedProductions,
      checkedProductions,
      totalQCInspections,
      passedQCInspections,
      failedQCInspections,
      avgPerformanceRating: parseFloat(qcPassRate) // Emulate rating block for PDF layout (stores pass rate value)
    },
    insights
  };
};

// @desc    Get report summary JSON
// @route   GET /api/reports/summary
// @access  Private
exports.getReportSummary = async (req, res, next) => {
  try {
    const data = await compileERPMetrics();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// @desc    Download server-rendered PDF Report
// @route   GET /api/reports/pdf
// @access  Private
exports.downloadPDFReport = async (req, res, next) => {
  try {
    const rawData = await compileERPMetrics();
    generatePDFReport(res, rawData);
  } catch (err) {
    next(err);
  }
};
