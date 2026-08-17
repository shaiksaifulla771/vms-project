const mongoose = require('mongoose');
const InventoryItem = require('../../models/InventoryItem');
const InventoryTransaction = require('../../models/InventoryTransaction');
const Material = require('../../models/Material');
const Warehouse = require('../../models/Warehouse');
const Site = require('../../models/Site');
const StockAdjustment = require('../../models/StockAdjustment');
const Sequence = require('../../models/Sequence');
const inventoryController = require('../../controllers/inventoryController');

describe('Inventory Module - Stock Overview & Operations Unit Tests', () => {
  let site;
  let warehouseA;
  let warehouseB;
  let material;

  beforeAll(() => {
    site = {
      _id: new mongoose.Types.ObjectId(),
      name: 'North Region Site',
      code: 'SITE-NR-01',
    };

    warehouseA = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Central Raw Warehouse',
      code: 'WH-NR-RAW',
      siteId: site._id,
    };

    warehouseB = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Packaging Warehouse',
      code: 'WH-NR-PKG',
      siteId: site._id,
    };

    material = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Pure Cane Sugar',
      code: 'RM-SUGAR-100',
      unit: 'kg',
      basePrice: 2.5,
      type: 'Raw Material',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Stock Overview & Summary Aggregations', () => {
    it('should return inventory items with calculated summary KPIs', async () => {
      const mockItems = [
        {
          _id: new mongoose.Types.ObjectId(),
          materialId: material,
          warehouseId: warehouseA,
          siteId: site,
          balance: 100,
          onHand: 100,
          reserved: 20,
          reservedBalance: 20,
          available: 80,
          batchNumber: 'BATCH-001',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          materialId: material,
          warehouseId: warehouseB,
          siteId: site,
          balance: 50,
          onHand: 50,
          reserved: 0,
          reservedBalance: 0,
          available: 50,
          batchNumber: 'BATCH-002',
        }
      ];

      jest.spyOn(InventoryItem, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems),
      });

      const req = { query: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await inventoryController.getInventoryBalances(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 2,
        summary: expect.objectContaining({
          totalSKUs: 2,
          totalOnHandUnits: 150,
          totalAvailableUnits: 130,
          totalReservedUnits: 20,
          totalStockValuation: 375, // 150 * 2.5
          inStockCount: 2,
        })
      }));
    });

    it('should resolve child warehouses when filtering by siteId', async () => {
      jest.spyOn(Warehouse, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([warehouseA, warehouseB]),
      });

      const findSpy = jest.spyOn(InventoryItem, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const req = { query: { siteId: site._id.toString() } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await inventoryController.getInventoryBalances(req, res, next);

      expect(Warehouse.find).toHaveBeenCalledWith({ siteId: site._id.toString() });
      expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
        $or: [
          { siteId: site._id.toString() },
          { warehouseId: { $in: [warehouseA._id, warehouseB._id] } }
        ]
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('2. Manual Stock Adjustment Creation', () => {
    it('should create pending stock adjustment request with valid sequence and metadata', async () => {
      jest.spyOn(Material, 'findById').mockResolvedValue(material);
      jest.spyOn(Sequence, 'findById').mockResolvedValue({ _id: 'stockAdjustment', seq: 1005 });
      jest.spyOn(Sequence, 'findByIdAndUpdate').mockResolvedValue({ _id: 'stockAdjustment', seq: 1006 });
      
      const createdAdj = {
        _id: new mongoose.Types.ObjectId(),
        adjNumber: 'ADJ-1006',
        materialId: material._id,
        warehouseId: warehouseA._id,
        adjustmentType: 'IN',
        quantity: 25,
        status: 'Pending Approval',
      };
      jest.spyOn(StockAdjustment, 'create').mockResolvedValue(createdAdj);

      const req = {
        body: {
          materialId: material._id.toString(),
          warehouseId: warehouseA._id.toString(),
          quantity: 25,
          reason: 'Cycle count correction',
          notes: 'Found extra pack in aisle 3',
        },
        user: { id: new mongoose.Types.ObjectId(), username: 'InventoryUser' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await inventoryController.createAdjustment(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('ADJ-1006'),
        data: createdAdj
      }));
    });
  });
});
