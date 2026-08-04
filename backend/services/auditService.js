const mongoose = require('mongoose');

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

/**
 * Writes an audit log entry in the same transaction as the data mutation.
 * 
 * @param {mongoose.ClientSession} session - The active MongoDB session
 * @param {String} entityType - The model name (e.g., 'Vendor', 'Material')
 * @param {mongoose.Types.ObjectId} entityId - The ID of the mutated document
 * @param {String} action - 'CREATE', 'UPDATE', 'DELETE', 'IMPORT'
 * @param {Object} oldDoc - The document state before mutation (null for CREATE)
 * @param {Object} newDoc - The document state after mutation (null for DELETE)
 * @param {mongoose.Types.ObjectId} userId - The user performing the action
 */
const writeAuditLog = async (session, entityType, entityId, action, oldDoc, newDoc, userId) => {
  const AuditLog = require('../models/AuditLog');
  
  let changes = {};
  if (action === 'CREATE') {
    changes = { after: newDoc ? (typeof newDoc.toObject === 'function' ? newDoc.toObject() : newDoc) : {} };
  } else if (action === 'DELETE') {
    changes = { before: oldDoc ? (typeof oldDoc.toObject === 'function' ? oldDoc.toObject() : oldDoc) : {} };
  } else {
    changes = computeDiff(oldDoc, newDoc);
  }

  // Only create log if there are actual changes
  if (action === 'UPDATE' && Object.keys(changes.before).length === 0 && Object.keys(changes.after).length === 0) {
    return null;
  }

  const logEntry = new AuditLog({
    entityType,
    entityId,
    action,
    userId,
    changes
  });

  // Save using the provided session to guarantee it commits/rolls back with the main transaction
  await logEntry.save({ session });
  return logEntry;
};

module.exports = {
  computeDiff,
  writeAuditLog
};
