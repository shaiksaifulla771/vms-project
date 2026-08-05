const mongoose = require('mongoose');

let supportsTransactions = false;

// Call this after connecting to DB to auto-detect replica set
exports.detectTransactionSupport = async () => {
  try {
    if (mongoose.connection && mongoose.connection.db) {
      const admin = mongoose.connection.db.admin();
      const info = await admin.command({ isMaster: 1 });
      // If setName exists, it is a replica set and supports transactions
      supportsTransactions = !!info.setName;
      console.log(`[Transaction System] MongoDB Replica Set detected: ${supportsTransactions}. Transactions ${supportsTransactions ? 'ENABLED' : 'DISABLED'}.`);
    }
  } catch (error) {
    console.warn('[Transaction System] Failed to detect transaction support, defaulting to DISABLED.');
    supportsTransactions = false;
  }
};

exports.withTransaction = async (session, operations) => {
  if (supportsTransactions) {
    session.startTransaction();
    try {
      await operations();
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    }
  } else {
    // Run without transaction wrapper safely
    await operations();
  }
};

exports.startSafeTransaction = (session) => {
  if (supportsTransactions) {
    session.startTransaction();
  }
};

exports.commitSafeTransaction = async (session) => {
  if (supportsTransactions && session.inTransaction()) {
    await session.commitTransaction();
  }
};

exports.abortSafeTransaction = async (session) => {
  if (supportsTransactions && session.inTransaction()) {
    await session.abortTransaction();
  }
};
