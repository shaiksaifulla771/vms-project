const mongoose = require('mongoose');
const crypto = require('crypto');

// Helper to compute deep diff between two objects
const computeDiff = (oldDoc, newDoc) => {
  const diff = { before: {}, after: {} };
  
  // Convert mongoose documents to plain objects
  const oldData = oldDoc ? (typeof oldDoc.toObject === 'function' ? oldDoc.toObject() : oldDoc) : {};
  const newData = newDoc ? (typeof newDoc.toObject === 'function' ? newDoc.toObject() : newDoc) : {};

  // Find all unique keys (excluding mongoose internals)
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  allKeys.delete('_id');
  allKeys.delete('__v');

  allKeys.forEach(key => {
    // Simple stringify comparison handles most nested objects/arrays for audit logging purposes
    const oldVal = JSON.stringify(oldData[key]);
    const newVal = JSON.stringify(newData[key]);

    if (oldVal !== newVal) {
      if (oldData[key] !== undefined) diff.before[key] = oldData[key];
      if (newData[key] !== undefined) diff.after[key] = newData[key];
    }
  });

  return diff;
};

// Async mutex for serializing hash-chain computations
let hashChainLock = Promise.resolve();
const serializeHashChain = (fn) => {
  hashChainLock = hashChainLock.catch(() => {}).then(fn);
  return hashChainLock;
};

const writeAuditLog = async (session, entityType, entityId, action, oldDoc, newDoc, userId = null, correlationId = null, ipAddress = null, userAgent = null) => {
  const AuditLog = require('../models/AuditLog');
  
  let changes = {};
  if (action === 'CREATE') {
    changes = { after: newDoc ? (typeof newDoc.toObject === 'function' ? newDoc.toObject() : newDoc) : {} };
  } else if (action === 'DELETE') {
    changes = { before: oldDoc ? (typeof oldDoc.toObject === 'function' ? oldDoc.toObject() : oldDoc) : {} };
  } else if (action === 'VIEW') {
    changes = newDoc; // Passing the view details directly in newDoc
  } else {
    changes = computeDiff(oldDoc, newDoc);
  }

  // Only create log if there are actual changes for UPDATE
  if (action === 'UPDATE' && Object.keys(changes.before).length === 0 && Object.keys(changes.after).length === 0) {
    return null;
  }

  return await serializeHashChain(async () => {
    const lastLog = await AuditLog.findOne().sort({ timestamp: -1, _id: -1 });
    const previousHash = lastLog ? lastLog.hashChain : 'GENESIS';
    const timestamp = Date.now();
    
    const hashData = JSON.stringify({ entityType, entityId, action, userId, changes, timestamp }) + previousHash;
    const hashChain = crypto.createHash('sha256').update(hashData).digest('hex');

    const logEntry = new AuditLog({
      entityType,
      entityId,
      action,
      userId,
      changes,
      timestamp,
      correlationId,
      ipAddress,
      userAgent,
      hashChain,
      previousHash
    });

    if (session) {
      await logEntry.save({ session });
    } else {
      await logEntry.save();
    }
    return logEntry;
  });
};

const logReadAccess = async (entityType, entityId, fieldNames, userId, ipAddress, correlationId) => {
  return await writeAuditLog(null, entityType, entityId, 'VIEW', null, { fieldsAccessed: fieldNames }, userId, correlationId, ipAddress, null);
};

const verifyChainIntegrity = async (startDate, endDate) => {
  const AuditLog = require('../models/AuditLog');
  const query = {};
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const logs = await AuditLog.find(query).sort({ timestamp: 1, _id: 1 });
  let valid = true;
  let brokenAt = null;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const hashData = JSON.stringify({
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      userId: log.userId,
      changes: log.changes,
      timestamp: new Date(log.timestamp).getTime()
    }) + log.previousHash;

    const computedHash = crypto.createHash('sha256').update(hashData).digest('hex');

    if (computedHash !== log.hashChain) {
      valid = false;
      brokenAt = i;
      break;
    }

    if (i > 0 && log.previousHash !== logs[i - 1].hashChain) {
      valid = false;
      brokenAt = i;
      break;
    }
  }

  return { valid, brokenAt, totalRecords: logs.length };
};

module.exports = {
  computeDiff,
  writeAuditLog,
  logReadAccess,
  verifyChainIntegrity
};
