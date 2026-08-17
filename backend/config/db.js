const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    if (isProd && !process.env.MONGO_URI && !process.env.MONGODB_URI && !process.env.PRODUCTION_MONGODB_URI) {
      console.error('FATAL ERROR: MONGO_URI, MONGODB_URI, or PRODUCTION_MONGODB_URI is required when NODE_ENV=production.');
      process.exit(1);
    }

    if (isTest && !process.env.TEST_MONGODB_URI) {
      console.error('FATAL ERROR: TEST_MONGODB_URI environment variable is required when NODE_ENV=test. Refusing to connect to development database.');
      process.exit(1);
    }

    let connStr;
    if (isTest) {
      connStr = process.env.TEST_MONGODB_URI;
    } else if (isProd) {
      connStr = process.env.PRODUCTION_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    } else {
      connStr = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    }
    const conn = await mongoose.connect(connStr, {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Polyfill for Standalone MongoDB Transaction Support
    const originalStartSession = mongoose.startSession.bind(mongoose);
    mongoose.startSession = async function (options) {
      const session = await originalStartSession(options);
      
      // If the database is a standalone instance, it does not support transactions.
      // We wrap the transaction methods to become no-ops to prevent fatal crashes
      // during local testing or simple deployments, gracefully degrading to non-transactional saves.
      const isStandalone = mongoose.connection.client?.topology?.s?.description?.type === 'Single';
      if (isStandalone) {
        session.startTransaction = function () {
          console.warn('[MongoDB Standalone] Ignored startTransaction call (not supported). Proceeding without transaction.');
        };
        session.commitTransaction = async function () {};
        session.abortTransaction = async function () {};
      }
      return session;
    };
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
