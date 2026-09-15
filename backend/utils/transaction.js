const mongoose = require('mongoose');

let supportsTransactions = false;

// Call this after connecting to DB to auto-detect replica set or sharded cluster
exports.detectTransactionSupport = async () => {
  try {
    if (mongoose.connection && mongoose.connection.db) {
      const admin = mongoose.connection.db.admin();
      let info;
      try {
        info = await admin.command({ hello: 1 });
      } catch (err) {
        info = await admin.command({ isMaster: 1 });
      }
      // If setName exists (replica set) or msg === 'isdbgrid' (mongos cluster), transactions are supported
      supportsTransactions = !!(info && (info.setName || info.msg === 'isdbgrid'));
      console.log(`[Transaction System] MongoDB Cluster detected: ReplicaSet/Sharded=${supportsTransactions}. Multi-document transactions ${supportsTransactions ? 'ENABLED' : 'DISABLED (graceful degradation active)'}.`);
      return supportsTransactions;
    }
  } catch (error) {
    console.warn(`[Transaction System] Failed to detect transaction support (${error.message}), defaulting to DISABLED.`);
    supportsTransactions = false;
  }
  return supportsTransactions;
};

exports.getSupportsTransactions = () => supportsTransactions;

exports.withTransaction = async (session, operations) => {
  if (supportsTransactions) {
    session.startTransaction();
    try {
      const result = await operations();
      await session.commitTransaction();
      return result;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    }
  } else {
    // Run without transaction wrapper safely
    return await operations();
  }
};

exports.startSafeTransaction = (session) => {
  if (supportsTransactions && session && typeof session.startTransaction === 'function') {
    session.startTransaction();
  }
};

exports.commitSafeTransaction = async (session) => {
  if (supportsTransactions && session && typeof session.inTransaction === 'function' && session.inTransaction()) {
    await session.commitTransaction();
  }
};

exports.abortSafeTransaction = async (session) => {
  if (supportsTransactions && session && typeof session.inTransaction === 'function' && session.inTransaction()) {
    await session.abortTransaction();
  }
};

