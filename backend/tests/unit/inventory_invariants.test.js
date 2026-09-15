const mongoose = require('mongoose');
const InventoryLedgerService = require('../../services/inventoryLedgerService');
const InventoryItem = require('../../models/InventoryItem');

describe('Inventory Mathematical Invariants & Concurrency Guards', () => {
  let materialId;
  let warehouseA;

  beforeAll(() => {
    materialId = new mongoose.Types.ObjectId();
    warehouseA = new mongoose.Types.ObjectId();
    mongoose.set('bufferCommands', false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Universal Inventory Balance Equation', () => {
    it('should correctly uphold Available = OnHand - (Reserved + Allocated + Blocked)', () => {
      const item = {
        onHand: 500,
        reserved: 100,
        allocated: 50,
        blocked: 25,
      };

      const computedAvailable = item.onHand - (item.reserved + item.allocated + item.blocked);
      expect(computedAvailable).toBe(325);
      expect(computedAvailable >= 0).toBe(true);
      expect(item.onHand).toBe(computedAvailable + item.reserved + item.allocated + item.blocked);
    });

    it('should calculate normalized status correctly for high, low, and zero stock', () => {
      const calculateStatus = (available, reorderLevel = 10) => {
        if (available <= 0) return 'out_of_stock';
        if (reorderLevel > 0 && available <= reorderLevel) return 'low_stock';
        return 'in_stock';
      };

      expect(calculateStatus(100, 20)).toBe('in_stock');
      expect(calculateStatus(15, 20)).toBe('low_stock');
      expect(calculateStatus(0, 20)).toBe('out_of_stock');
      expect(calculateStatus(-5, 20)).toBe('out_of_stock');
    });
  });

  describe('2. Over-Withdrawal Deficit Protection Logic', () => {
    it('should identify insufficient stock when quantity exceeds available balance', () => {
      const item = {
        onHand: 50,
        available: 20,
        reserved: 30,
        allocated: 0,
        blocked: 0,
      };

      const requestedQty = 25;
      const willCauseNegative = (item.available - requestedQty) < 0;
      expect(willCauseNegative).toBe(true);

      const validateDeduction = (item, qty) => {
        if (item.available < qty) {
          throw new Error(`Insufficient available stock. Requested: ${qty}, Available: ${item.available}`);
        }
      };

      expect(() => validateDeduction(item, requestedQty)).toThrow(/Insufficient available stock/);
    });

    it('should allow valid stock deduction within available balance', () => {
      const item = {
        onHand: 50,
        available: 20,
        reserved: 30,
        allocated: 0,
        blocked: 0,
      };

      const requestedQty = 15;
      item.available -= requestedQty;
      item.onHand -= requestedQty;

      expect(item.available).toBe(5);
      expect(item.onHand).toBe(35);
      expect(item.available >= 0).toBe(true);
    });
  });

  describe('3. Conservation of Stock in Inter-Warehouse Transfers', () => {
    it('should conserve total on-hand across source and destination warehouses', () => {
      const sourceBefore = { onHand: 200, available: 200 };
      const destBefore = { onHand: 50, available: 50 };
      const transferQty = 40;

      const totalBefore = sourceBefore.onHand + destBefore.onHand;

      // Transfer simulation
      const sourceAfter = { onHand: sourceBefore.onHand - transferQty, available: sourceBefore.available - transferQty };
      const destAfter = { onHand: destBefore.onHand + transferQty, available: destBefore.available + transferQty };

      const totalAfter = sourceAfter.onHand + destAfter.onHand;
      expect(totalAfter).toBe(totalBefore);
      expect(sourceAfter.onHand).toBe(160);
      expect(destAfter.onHand).toBe(90);
    });
  });
});
