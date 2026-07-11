const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductionOrder = require('../models/ProductionOrder');
const QualityRecord = require('../models/QualityRecord');
const { generatePDFReport } = require('../utils/pdfGenerator');

// Simple mock res to pipe PDF kit output to file
class MockResponse {
  constructor(filePath) {
    this.stream = fs.createWriteStream(filePath);
    this.headers = {};
  }
  setHeader(name, val) {
    this.headers[name] = val;
  }
  // Implement writable stream interfaces used by pdfkit pipe
  write(chunk, encoding, cb) {
    return this.stream.write(chunk, encoding, cb);
  }
  once(event, cb) {
    return this.stream.once(event, cb);
  }
  emit(event, ...args) {
    return this.stream.emit(event, ...args);
  }
  end(chunk, encoding, cb) {
    this.stream.end(chunk, encoding, cb);
  }
  removeListener(event, listener) {
    return this.stream.removeListener(event, listener);
  }
}

const compileERPMetrics = async () => {
  const totalMaterials = await Material.countDocuments();
  const rawMaterials = await Material.countDocuments({ type: 'Raw' });
  const finishedGoods = await Material.countDocuments({ type: 'Finished' });
  const totalBOMs = await BOM.countDocuments();
  const stockItems = await InventoryItem.find();
  const totalStockQuantity = stockItems.reduce((sum, item) => sum + (item.balance || 0), 0);
  const materialsWithStock = stockItems.filter(item => item.balance > 0).length;
  const totalPOs = await PurchaseOrder.countDocuments();
  const approvedPOs = await PurchaseOrder.countDocuments({ status: 'Approved' });
  const receivedPOs = await PurchaseOrder.countDocuments({ status: 'Received' });
  const pendingPOs = await PurchaseOrder.countDocuments({ status: 'Pending' });
  const receivedOrders = await PurchaseOrder.find({ status: 'Received' });
  const totalProcurementSpend = receivedOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
  const pendingOrders = await PurchaseOrder.find({ status: 'Pending' });
  const pendingProcurementSpend = pendingOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
  const totalProductions = await ProductionOrder.countDocuments();
  const completedProductions = await ProductionOrder.countDocuments({ status: 'Completed' });
  const checkedProductions = await ProductionOrder.countDocuments({ status: 'QC Checked' });
  const totalQCInspections = await QualityRecord.countDocuments();
  const passedQCInspections = await QualityRecord.countDocuments({ status: 'Passed' });
  const failedQCInspections = await QualityRecord.countDocuments({ status: 'Failed' });

  const qcPassRate = totalQCInspections > 0 
    ? ((passedQCInspections / totalQCInspections) * 100).toFixed(1) 
    : '100.0';
  const stockCoverage = totalMaterials > 0 
    ? ((materialsWithStock / totalMaterials) * 100).toFixed(1) 
    : '0';
  const bomCoverage = finishedGoods > 0 
    ? ((totalBOMs / finishedGoods) * 100).toFixed(1) 
    : '100.0';

  const insights = [
    {
      title: 'Warehouse Material Stock Coverage',
      description: `Active balances are recorded for ${materialsWithStock} out of ${totalMaterials} total master materials (${stockCoverage}% warehouse coverage).`
    },
    {
      title: 'Bill of Materials Configuration Status',
      description: `BOM recipes are configured for ${totalBOMs} out of ${finishedGoods} finished product profiles (${bomCoverage}% configuration rate).`
    },
    {
      title: 'Quality Assurance Compliance Rate',
      description: `Quality control inspections have checked ${totalQCInspections} manufacturing batches with a ${qcPassRate}% pass rate.`
    },
    {
      title: 'Procurement Investment Spend',
      description: `Total procurement expenditure stands at $${totalProcurementSpend.toLocaleString()} across ${receivedPOs} finalized POs.`
    },
    {
      title: 'Pending Approvals Procurement Exposure',
      description: `There are ${pendingPOs} pending purchase orders, representing a cash commitment of $${pendingProcurementSpend.toLocaleString()}.`
    },
    {
      title: 'Manufacturing Batch Operations Distribution',
      description: `Out of ${totalProductions} production orders, ${completedProductions} are complete, and ${checkedProductions} are QC Checked.`
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
      avgPerformanceRating: parseFloat(qcPassRate)
    },
    insights
  };
};

mongoose.connect('mongodb://127.0.0.1:27017/vms').then(async () => {
  try {
    console.log('Compiling metrics...');
    const data = await compileERPMetrics();
    
    const outPath = path.join(__dirname, '..', 'test_output.pdf');
    console.log(`Piping PDF output to: ${outPath}`);
    
    const mockRes = new MockResponse(outPath);
    generatePDFReport(mockRes, data);
    
    // Wait for stream to finish writing
    mockRes.stream.on('finish', () => {
      const stats = fs.statSync(outPath);
      console.log('PDF Generation finished.');
      console.log(`PDF File Size: ${stats.size} bytes`);
      if (stats.size > 0) {
        console.log('✅ Success: PDF generated with non-zero size!');
      } else {
        console.error('❌ Error: PDF file is empty!');
      }
      mongoose.connection.close();
    });
  } catch (err) {
    console.error('Test run crashed:', err);
    mongoose.connection.close();
  }
});
