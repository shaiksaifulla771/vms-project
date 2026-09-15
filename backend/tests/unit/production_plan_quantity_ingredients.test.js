const mongoose = require('mongoose');
const ProductionPlan = require('../../models/ProductionPlan');
const ProductionOrder = require('../../models/ProductionOrder');
const Material = require('../../models/Material');
const BOM = require('../../models/BOM');
const Warehouse = require('../../models/Warehouse');
const Sequence = require('../../models/Sequence');
const MRPEngineService = require('../../services/mrpEngineService');
const ProductionPlanningEngine = require('../../services/productionPlanningEngine');
const productionPlanController = require('../../controllers/productionPlanController');

jest.setTimeout(60000);

describe('Production Plan - Plan Quantity & Multi-Ingredient Unit Tests', () => {
  let warehouse;
  let finishedGood;
  let rawIngredientA;
  let rawIngredientB;

  beforeAll(() => {
    warehouse = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Central Packaging Warehouse',
      code: 'WH-PKG-01',
    };

    finishedGood = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Premium Chocolate 100g',
      code: 'FG-CHOC-100',
      unit: 'pcs',
      type: 'Finished',
      makeOrBuy: 'MAKE',
    };

    rawIngredientA = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Cocoa Butter',
      code: 'RM-COCOA-01',
      unit: 'kg',
      type: 'Raw Material',
      makeOrBuy: 'BUY',
    };

    rawIngredientB = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Milk Powder',
      code: 'RM-MILK-01',
      unit: 'kg',
      type: 'Raw Material',
      makeOrBuy: 'BUY',
    };

    // Mock Sequence model to prevent DB timeouts
    jest.spyOn(Sequence, 'findById').mockResolvedValue({ _id: 'productionOrder', seq: 1001 });
    jest.spyOn(Sequence, 'findByIdAndUpdate').mockResolvedValue({ _id: 'productionOrder', seq: 1002 });
    jest.spyOn(ProductionPlanningEngine, 'canExecute').mockResolvedValue({ allowed: true });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('1. Pre-validate & Pre-save Hooks Calculation', () => {
    it('should compute totalQuantity as quantityPerPlan * totalPlans * (1 + loss%) automatically', async () => {
      const plan = new ProductionPlan({
        planNumber: 'PLAN-TEST-ING-01',
        planName: 'Chocolate Batch 100',
        productId: finishedGood._id,
        warehouseId: warehouse._id,
        totalPlans: 10,
        ingredients: [
          {
            material: rawIngredientA._id,
            materialCode: rawIngredientA.code,
            materialName: rawIngredientA.name,
            quantityPerPlan: 2.5,
            uom: 'kg',
            lossPercentage: 2, // 2% loss
          },
          {
            material: rawIngredientB._id,
            materialCode: rawIngredientB.code,
            materialName: rawIngredientB.name,
            quantityPerPlan: 1.0,
            uom: 'kg',
            lossPercentage: 0,
          }
        ],
        requiredDate: new Date(Date.now() + 7 * 86400000),
      });

      // Trigger pre-validate hook
      await plan.validate();

      // Ingredient A: 2.5 * 10 * 1.02 = 25.5 kg
      expect(plan.ingredients[0].totalQuantity).toBe(25.5);
      // Ingredient B: 1.0 * 10 * 1.0 = 10.0 kg
      expect(plan.ingredients[1].totalQuantity).toBe(10.0);
      expect(plan.availablePlans).toBe(10);
      expect(plan.releasedPlans).toBe(0);
      expect(plan.quantity).toBe(10);
    });
  });

  describe('2. Atomic Plan Usage & Validation Rules', () => {
    it('should reject use request if requested quantity > availablePlans', async () => {
      const mockPlan = {
        _id: new mongoose.Types.ObjectId(),
        planNumber: 'PLAN-TEST-USE-01',
        totalPlans: 5,
        availablePlans: 3,
        releasedPlans: 2,
      };

      jest.spyOn(ProductionPlan, 'findById').mockResolvedValueOnce(mockPlan);

      const req = {
        params: { id: mockPlan._id },
        body: { quantity: 4 } // 4 > 3 available
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await productionPlanController.useProductionPlan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('exceeds available plans'),
      }));
    });

    it('should correctly decrement availablePlans and increment releasedPlans on partial release', async () => {
      const planDoc = new ProductionPlan({
        planNumber: 'PLAN-TEST-USE-02',
        planName: 'Batch Release Plan',
        productId: finishedGood._id,
        warehouseId: warehouse._id,
        totalPlans: 10,
        availablePlans: 10,
        releasedPlans: 0,
        status: 'SCHEDULED',
        requiredDate: new Date(),
        ingredients: [
          {
            material: rawIngredientA._id,
            quantityPerPlan: 2,
            totalQuantity: 20,
            uom: 'kg',
          }
        ]
      });

      planDoc.save = jest.fn().mockResolvedValue(planDoc);
      jest.spyOn(ProductionPlan, 'findById').mockResolvedValueOnce(planDoc);
      jest.spyOn(ProductionOrder, 'create').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        prdNumber: 'PRD-TEST-001',
        targetQuantity: 4,
        status: 'DRAFT',
      });

      const req = {
        params: { id: planDoc._id },
        body: { quantity: 4 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await productionPlanController.useProductionPlan(req, res, next);

      expect(planDoc.availablePlans).toBe(6);
      expect(planDoc.releasedPlans).toBe(4);
      expect(planDoc.status).toBe('SCHEDULED'); // Partial: not all released yet
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should transition plan status to RELEASED when availablePlans becomes 0', async () => {
      const planDoc = new ProductionPlan({
        planNumber: 'PLAN-TEST-USE-03',
        planName: 'Full Release Plan',
        productId: finishedGood._id,
        warehouseId: warehouse._id,
        totalPlans: 5,
        availablePlans: 5,
        releasedPlans: 0,
        status: 'SCHEDULED',
        requiredDate: new Date(),
      });

      planDoc.save = jest.fn().mockResolvedValue(planDoc);
      jest.spyOn(ProductionPlan, 'findById').mockResolvedValueOnce(planDoc);
      jest.spyOn(ProductionOrder, 'create').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        prdNumber: 'PRD-TEST-002',
        targetQuantity: 5,
        status: 'DRAFT',
      });

      const req = {
        params: { id: planDoc._id },
        body: { quantity: 5 }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await productionPlanController.useProductionPlan(req, res, next);

      expect(planDoc.availablePlans).toBe(0);
      expect(planDoc.releasedPlans).toBe(5);
      expect(planDoc.status).toBe('RELEASED');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('3. Plan Restoration on Order Cancellation', () => {
    it('should restore availablePlans and decrement releasedPlans when order is cancelled', async () => {
      const planId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      const planDoc = new ProductionPlan({
        _id: planId,
        planNumber: 'PLAN-TEST-RESTORE-01',
        totalPlans: 10,
        availablePlans: 6,
        releasedPlans: 4,
        status: 'SCHEDULED',
        requiredDate: new Date(),
      });

      const orderDoc = {
        _id: orderId,
        planId: planId,
        prdNumber: 'PRD-TEST-003',
        targetQuantity: 4,
        completedQuantity: 0,
        status: 'CANCELLED',
      };

      planDoc.save = jest.fn().mockResolvedValue(planDoc);
      jest.spyOn(ProductionPlan, 'findById').mockResolvedValueOnce(planDoc);
      jest.spyOn(ProductionOrder, 'findById').mockResolvedValueOnce(orderDoc);

      const req = {
        params: { id: planDoc._id },
        body: { quantity: 4, productionOrderId: orderId.toString() }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await productionPlanController.restoreProductionPlan(req, res, next);

      expect(planDoc.availablePlans).toBe(10);
      expect(planDoc.releasedPlans).toBe(0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('restored 4 plans'),
      }));
    });
  });
});
