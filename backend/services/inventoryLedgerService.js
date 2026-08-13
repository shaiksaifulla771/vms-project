const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const auditService = require('./auditService');

/**
 * InventoryLedgerService — Single entry point for all inventory mutations.
 * Enforces atomic transactions, non-negative available stock, idempotency, OCC retries, and immutable ledger entries.
 */
class InventoryLedgerService {
  /**
   * Process an inventory transaction atomically.
   */
  static async recordTransaction(params) {
    const {
      materialId,
      warehouseId,
      siteId,
      batchNumber = 'DEFAULT',
      lotNumber,
      quantity,
      type,
      referenceId,
      sourceDocType,
      sourceDocId,
      idempotencyKey,
      reason,
      userId,
      notes,
    } = params;

    if (!materialId || !warehouseId || quantity === undefined || !type) {
      throw new Error('Missing required inventory transaction parameters (materialId, warehouseId, quantity, type)');
    }

    // Idempotency check: return existing transaction if already processed
    if (idempotencyKey) {
      const existingTx = await InventoryTransaction.findOne({ idempotencyKey });
      if (existingTx) {
        return { success: true, duplicate: true, transaction: existingTx };
      }
    }

    let retries = 10;
    while (retries > 0) {
      let session = null;
      let useTransaction = true;

      try {
        session = await mongoose.startSession();
      } catch (e) {
        useTransaction = false;
      }

      try {
        let result;

        const executeOperations = async (activeSession) => {
          const opts = activeSession ? { session: activeSession } : {};
          
          let item = await InventoryItem.findOne({ materialId, warehouseId, batchNumber }, null, opts);
          if (!item) {
            // Fallback: lookup any existing item for this material & warehouse
            item = await InventoryItem.findOne({ materialId, warehouseId }, null, opts);
          }

          let isNewItem = false;

          if (!item) {
            isNewItem = true;
            item = new InventoryItem({
              materialId,
              warehouseId,
              siteId,
              batchNumber,
              lotNumber,
              onHand: 0,
              available: 0,
              reserved: 0,
              allocated: 0,
              blocked: 0,
              balance: 0,
              reservedBalance: 0,
              version: 1
            });
          }

          // Auto-sync available balance if onHand exists but available was zero/uninitialized
          if (item.available === 0 && item.onHand > 0) {
            const calculatedAvail = item.onHand - (item.reserved || 0) - (item.allocated || 0) - (item.blocked || 0);
            if (calculatedAvail > 0) {
              item.available = calculatedAvail;
            }
          }

          const beforeQty = item.onHand;
          let delta = 0;
          const originalVersion = item.version || 1;

          switch (type) {
            case 'Opening':
            case 'GRN':
            case 'purchase':
            case 'Production Receipt':
            case 'PRODUCTION_OUTPUT':
            case 'ADJUSTMENT_IN':
            case 'TRANSFER_IN':
              delta = Math.abs(quantity);
              item.onHand += delta;
              item.available += delta;
              break;

            case 'Issue':
            case 'consumption':
            case 'Production Consumption':
            case 'PRODUCTION_CONSUMPTION':
            case 'Scrap':
            case 'ADJUSTMENT_OUT':
            case 'TRANSFER_OUT':
            case 'Transfer Out':
              delta = -Math.abs(quantity);
              if (item.allocated >= Math.abs(delta)) {
                item.allocated -= Math.abs(delta);
              } else if (item.reserved >= Math.abs(delta)) {
                item.reserved -= Math.abs(delta);
              } else if (item.available >= Math.abs(delta)) {
                item.available -= Math.abs(delta);
              } else {
                if (item.available + item.reserved + item.allocated < Math.abs(delta)) {
                  throw new Error(`Insufficient available stock for material ${materialId}. Requested: ${Math.abs(delta)}, Available: ${item.available}`);
                }
                item.available = Math.max(0, item.available - Math.abs(delta));
              }
              item.onHand = Math.max(0, item.onHand - Math.abs(delta));
              break;

            case 'Reservation':
            case 'RESERVATION':
              if (item.available < Math.abs(quantity)) {
                throw new Error(`Cannot reserve stock. Requested: ${Math.abs(quantity)}, Available: ${item.available}`);
              }
              item.available -= Math.abs(quantity);
              item.reserved += Math.abs(quantity);
              delta = 0;
              break;

            case 'Release':
            case 'RELEASE':
              const releaseQty = Math.min(item.reserved, Math.abs(quantity));
              item.reserved -= releaseQty;
              item.available += releaseQty;
              delta = 0;
              break;

            case 'Allocation':
              const allocQty = Math.min(item.reserved, Math.abs(quantity));
              item.reserved -= allocQty;
              item.allocated += allocQty;
              delta = 0;
              break;

            case 'QC Hold':
              if (item.available < Math.abs(quantity)) {
                throw new Error(`Cannot place on QC Hold. Requested: ${Math.abs(quantity)}, Available: ${item.available}`);
              }
              item.available -= Math.abs(quantity);
              item.blocked += Math.abs(quantity);
              delta = 0;
              break;

            case 'QC Release':
              const qcRelQty = Math.min(item.blocked, Math.abs(quantity));
              item.blocked -= qcRelQty;
              item.available += qcRelQty;
              delta = 0;
              break;

            case 'Adjustment':
            case 'Transfer In':
              delta = quantity;
              item.onHand += delta;
              item.available += delta;
              break;

            default:
              delta = quantity;
              item.onHand += delta;
              item.available += delta;
              break;
          }

          if (item.onHand < 0 || item.available < 0 || item.reserved < 0 || item.allocated < 0 || item.blocked < 0) {
            throw new Error(`Inventory transaction validation failed: Resulting balances cannot be negative. (onHand: ${item.onHand}, available: ${item.available})`);
          }

          item.balance = item.onHand;
          item.reservedBalance = item.reserved;

          let savedItem;
          if (isNewItem) {
            try {
              savedItem = await item.save(opts);
            } catch (saveErr) {
              if (saveErr.code === 11000) {
                // Duplicate key error on create -> another thread created it, trigger retry
                const err = new Error('OCC Conflict: Item created concurrently');
                err.name = 'VersionError';
                throw err;
              }
              throw saveErr;
            }
          } else {
            // Strict OCC update: atomic findOneAndUpdate requiring version === originalVersion
            savedItem = await InventoryItem.findOneAndUpdate(
              { _id: item._id, version: originalVersion },
              {
                $set: {
                  onHand: item.onHand,
                  available: item.available,
                  reserved: item.reserved,
                  allocated: item.allocated,
                  blocked: item.blocked,
                  balance: item.balance,
                  reservedBalance: item.reservedBalance,
                },
                $inc: { version: 1 }
              },
              { new: true, runValidators: true, ...opts }
            );

            if (!savedItem) {
              const occErr = new Error('OCC Conflict: Item updated by another concurrent transaction');
              occErr.name = 'VersionError';
              throw occErr;
            }
          }

          const txnId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

          const transactionArr = await InventoryTransaction.create([{
            txnId,
            idempotencyKey,
            materialId,
            warehouseId,
            siteId,
            batchNumber,
            lotNumber,
            quantity,
            delta,
            beforeQty,
            afterQty: savedItem.onHand,
            type,
            referenceId,
            sourceDocType,
            sourceDocId,
            reason,
            userId,
            notes,
          }], opts);

          const transaction = transactionArr[0];

          await auditService.writeAuditLog(activeSession, 'InventoryItem', savedItem._id, delta > 0 ? 'CREATE' : 'UPDATE', null, savedItem, params.userId || null);

          return {
            success: true,
            transaction,
            itemBalances: {
              onHand: savedItem.onHand,
              available: savedItem.available,
              reserved: savedItem.reserved,
              allocated: savedItem.allocated,
              blocked: savedItem.blocked,
            },
          };
        };

        if (session && useTransaction) {
          try {
            await session.withTransaction(async () => {
              result = await executeOperations(session);
            });
          } catch (txErr) {
            if (txErr.message && txErr.message.includes('Transaction numbers are only allowed')) {
              result = await executeOperations(null);
            } else {
              throw txErr;
            }
          }
        } else {
          result = await executeOperations(null);
        }

        if (session) session.endSession();
        return result;

      } catch (err) {
        if (session) session.endSession();
        const isTransient = err.name === 'VersionError' || 
                            err.codeName === 'WriteConflict' || 
                            (err.message && err.message.includes('OCC Conflict')) ||
                            (err.hasErrorLabel && err.hasErrorLabel('TransientTransactionError'));

        if (isTransient) {
          retries--;
          if (retries === 0) throw err;
          // Exponential jittered backoff for concurrent retries
          await new Promise(res => setTimeout(res, Math.floor(Math.random() * 25) + 10));
        } else {
          throw err;
        }
      }
    }
  }
}

module.exports = InventoryLedgerService;
