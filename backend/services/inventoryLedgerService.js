const mongoose = require('mongoose');
const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const Warehouse = require('../models/Warehouse');
const auditService = require('./auditService');

// Transaction type classification. Every type MUST be listed here; unknown
// types are rejected instead of silently being treated as stock increases.
const INBOUND_TYPES = new Set([
  'Opening', 'GRN', 'purchase', 'Production Receipt', 'PRODUCTION_OUTPUT', 'PRODUCTION_IN',
  'production', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'Transfer In', 'RECEIPT', 'Return', 'RETURN',
]);
const OUTBOUND_TYPES = new Set([
  'Issue', 'ISSUE', 'consumption', 'Production Consumption', 'PRODUCTION_CONSUMPTION', 'Scrap',
  'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'Transfer Out', 'Transfer',
]);
// Outbound types that represent real consumption/issue — expired lots are blocked for these.
const CONSUMPTION_TYPES = new Set([
  'Issue', 'ISSUE', 'consumption', 'Production Consumption', 'PRODUCTION_CONSUMPTION',
]);
const SIGNED_TYPES = new Set(['Adjustment', 'adjustment', 'REVERSAL']);
const STATE_TYPES = new Set(['Reservation', 'RESERVATION', 'Release', 'RELEASE', 'Allocation', 'QC Hold', 'QC Release']);

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
      mfgDate,
      expiryDate,
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
    if (!INBOUND_TYPES.has(type) && !OUTBOUND_TYPES.has(type) && !SIGNED_TYPES.has(type) && !STATE_TYPES.has(type)) {
      const err = new Error(`Unknown inventory transaction type '${type}'`);
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(Number(quantity))) {
      const err = new Error('Transaction quantity must be a number');
      err.status = 400;
      throw err;
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
          const effectiveBatch = (batchNumber === 'DEFAULT' && lotNumber) ? lotNumber : batchNumber;
          
          let item = null;
          if (lotNumber) {
            item = await InventoryItem.findOne({ materialId, warehouseId, $or: [{ lotNumber }, { batchNumber: lotNumber }] }, null, opts);
          }
          if (!item) {
            item = await InventoryItem.findOne({ materialId, warehouseId, batchNumber: effectiveBatch }, null, opts);
          }
          if (!item && !lotNumber) {
            item = await InventoryItem.findOne({ materialId, warehouseId }, null, opts);
          }

          let isNewItem = false;

          if (!item) {
            isNewItem = true;
            let resolvedSiteId = siteId;
            if (warehouseId) {
              const whDoc = await Warehouse.findById(warehouseId).lean().catch(() => null);
              if (whDoc && whDoc.siteId) {
                resolvedSiteId = whDoc.siteId;
              }
            }

            item = new InventoryItem({
              materialId,
              warehouseId,
              siteId: resolvedSiteId,
              batchNumber: effectiveBatch,
              lotNumber: lotNumber || (effectiveBatch !== 'DEFAULT' ? effectiveBatch : undefined),
              mfgDate: mfgDate || undefined,
              expiryDate: expiryDate || undefined,
              onHand: 0,
              available: 0,
              reserved: 0,
              allocated: 0,
              blocked: 0,
              balance: 0,
              reservedBalance: 0,
              version: 1
            });
          } else {
            if (lotNumber && !item.lotNumber) item.lotNumber = lotNumber;
            if (mfgDate && !item.mfgDate) item.mfgDate = mfgDate;
            if (expiryDate && !item.expiryDate) item.expiryDate = expiryDate;
          }

          // Auto-sync available balance if onHand exists but available was zero/uninitialized
          if (item.available === 0 && item.onHand > 0) {
            const calculatedAvail = item.onHand - (item.reserved || 0) - (item.allocated || 0) - (item.blocked || 0);
            if (calculatedAvail > 0) {
              item.available = calculatedAvail;
            }
          }

          if (CONSUMPTION_TYPES.has(type) && item.expiryDate && new Date(item.expiryDate) < new Date()) {
            const expErr = new Error(`Lot ${item.lotNumber || item.batchNumber} expired on ${new Date(item.expiryDate).toISOString().slice(0, 10)} and cannot be consumed or issued.`);
            expErr.status = 400;
            throw expErr;
          }
          if (isNewItem && OUTBOUND_TYPES.has(type)) {
            const nfErr = new Error(`No stock found for material ${materialId}${lotNumber ? ` in lot ${lotNumber}` : ''} at the selected warehouse.`);
            nfErr.status = 400;
            throw nfErr;
          }

          const beforeQty = item.onHand;
          const before = {
            onHand: item.onHand, available: item.available, reserved: item.reserved,
            allocated: item.allocated, blocked: item.blocked, balance: item.balance, reservedBalance: item.reservedBalance,
          };
          let delta = 0;
          const originalVersion = item.version || 1;

          if (INBOUND_TYPES.has(type)) {
            delta = Math.abs(quantity);
            item.onHand += delta;
            item.available += delta;
          } else if (OUTBOUND_TYPES.has(type)) {
            delta = -Math.abs(quantity);
            const need = Math.abs(delta);
            if (item.available + item.reserved + item.allocated < need) {
              const insErr = new Error(`Insufficient stock for material ${materialId}${lotNumber ? ` (lot ${lotNumber})` : ''}. Requested: ${need}, Available: ${item.available}`);
              insErr.status = 400;
              throw insErr;
            }
            if (item.allocated >= need) {
              item.allocated -= need;
            } else if (item.reserved >= need) {
              item.reserved -= need;
            } else {
              item.available = Math.max(0, item.available - need);
            }
            item.onHand = item.onHand - need;
          } else switch (type) {
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
            case 'adjustment':
            case 'REVERSAL':
              delta = Number(quantity);
              item.onHand += delta;
              item.available += delta;
              break;

            default:
              throw new Error(`Unhandled inventory transaction type '${type}'`);
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
                // Concurrent item creation collision -> fetch existing item and update balances directly
                const existingItem = await InventoryItem.findOne({ materialId, warehouseId, batchNumber: item.batchNumber }, null, opts);
                if (existingItem) {
                  existingItem.onHand += Math.max(0, delta);
                  existingItem.available += Math.max(0, delta);
                  existingItem.balance = existingItem.onHand;
                  existingItem.reservedBalance = existingItem.reserved;
                  savedItem = await InventoryItem.findOneAndUpdate(
                    { _id: existingItem._id },
                    {
                      $set: {
                        onHand: existingItem.onHand,
                        available: existingItem.available,
                        balance: existingItem.balance,
                        reservedBalance: existingItem.reservedBalance
                      },
                      $inc: { version: 1 }
                    },
                    { new: true, runValidators: true, ...opts }
                  );
                }
                
                if (!savedItem) {
                  const err = new Error('OCC Conflict: Item created concurrently');
                  err.name = 'VersionError';
                  throw err;
                }
              } else {
                throw saveErr;
              }
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

          let transactionArr;
          try {
            transactionArr = await InventoryTransaction.create([{
            txnId,
            idempotencyKey,
            materialId,
            warehouseId,
            siteId: siteId || savedItem.siteId,
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
          } catch (ledgerErr) {
            // Without a real DB transaction, undo the balance change so stock and ledger never diverge.
            if (!activeSession || !activeSession.inTransaction || !activeSession.inTransaction()) {
              if (isNewItem) {
                await InventoryItem.deleteOne({ _id: savedItem._id }).catch(() => {});
              } else {
                await InventoryItem.updateOne({ _id: savedItem._id }, { $set: before, $inc: { version: 1 } }).catch(() => {});
              }
            }
            throw ledgerErr;
          }

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
            // Fallback for non-replica set standalone MongoDB instances
            result = await executeOperations(null);
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
