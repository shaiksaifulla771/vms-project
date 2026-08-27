const mongoose = require('mongoose');
const dns = require('dns');
const { detectTransactionSupport } = require('../utils/transaction');

// Fallback to Google & Cloudflare DNS for robust Atlas SRV lookup on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (dnsErr) {
  // Ignored if custom DNS cannot be set in current environment
}

let connectionPromise = null;
let sessionPolyfillInstalled = false;
let isReconnecting = false;
let reconnectTimer = null;

/**
 * Installs graceful fallback polyfill for standalone/non-replica MongoDB instances
 */
function installSessionPolyfill() {
  if (sessionPolyfillInstalled) return;
  sessionPolyfillInstalled = true;

  const originalStartSession = mongoose.startSession.bind(mongoose);
  mongoose.startSession = async function (options) {
    const session = await originalStartSession(options);
    
    // Check if current connected topology does not support transactions
    const topologyType = mongoose.connection.client?.topology?.s?.description?.type;
    const isStandalone = topologyType === 'Single' || topologyType === 'Unknown';

    if (isStandalone) {
      session.startTransaction = function () {
        // Gracefully ignore startTransaction on standalone instances without crashing
      };
      session.commitTransaction = async function () {};
      session.abortTransaction = async function () {};
      session.inTransaction = function () { return false; };
    }
    return session;
  };
}

/**
 * Automatic Auto-Reconnect Watchdog
 */
function scheduleAutoReconnect() {
  if (isReconnecting || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  isReconnecting = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log('[MongoDB Watchdog] Connection lost. Scheduling auto-reconnect in 5s...');
  reconnectTimer = setTimeout(async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        console.log('[MongoDB Watchdog] Attempting automatic reconnection to cluster...');
        await connectDB();
      }
    } catch (err) {
      console.warn('[MongoDB Watchdog] Reconnect attempt failed:', err.message);
    } finally {
      isReconnecting = false;
      if (mongoose.connection.readyState === 0) {
        scheduleAutoReconnect();
      }
    }
  }, 5000);
}

// Attach connection lifecycle event handlers once
mongoose.connection.on('connected', () => {
  console.log(`[MongoDB Event] Connected to MongoDB host: ${mongoose.connection.host} (DB: ${mongoose.connection.name})`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB Event] Disconnected from MongoDB cluster.');
  scheduleAutoReconnect();
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB Event] Reconnected to MongoDB cluster successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB Event] Connection error: ${err.message}`);
});

const connectDB = async () => {
  try {
    // If already connected (1) or connecting (2), reuse active connection
    if (mongoose.connection.readyState === 1) {
      installSessionPolyfill();
      return connectionPromise || mongoose.connection;
    }

    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    if (isProd && !process.env.MONGO_URI && !process.env.MONGODB_URI && !process.env.PRODUCTION_MONGODB_URI) {
      console.error('FATAL ERROR: MONGO_URI, MONGODB_URI, or PRODUCTION_MONGODB_URI is required when NODE_ENV=production.');
      process.exit(1);
    }

    let connStr;
    if (isTest) {
      connStr = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    } else if (isProd) {
      connStr = process.env.PRODUCTION_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
    } else {
      connStr = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    }

    const connectionOptions = {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      family: 4,
      retryWrites: true,
      retryReads: true,
      autoIndex: true
    };
    
    try {
      if (!connStr && isTest) {
        throw new Error('No test URI provided, initiate in-memory test database fallback');
      }
      const conn = await mongoose.connect(connStr, connectionOptions);
      console.log(`MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
      
      // Auto-detect replica set / sharded cluster support for transactions
      await detectTransactionSupport();
      installSessionPolyfill();

      connectionPromise = conn;
      return conn;
    } catch (primaryErr) {
      if (!isProd && (primaryErr.message.includes('ECONNREFUSED') || primaryErr.message.includes('ENOTFOUND') || primaryErr.message.includes('test database fallback') || primaryErr.name === 'MongooseServerSelectionError' || primaryErr.name === 'MongoServerSelectionError')) {
        console.warn(`[MongoDB] Primary connection unavailable (${primaryErr.message}). Falling back to mongodb-memory-server...`);
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect().catch(() => {});
        }
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        const memConn = await mongoose.connect(mongoUri, {
          maxPoolSize: 50,
          minPoolSize: 10,
        });
        console.log(`[MongoDB] Memory Server Connected: ${mongoUri}`);

        await detectTransactionSupport();
        installSessionPolyfill();

        connectionPromise = memConn;
        return memConn;
      } else {
        throw primaryErr;
      }
    }
  } catch (error) {
    console.error(`Database Connection Fatal Error: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      scheduleAutoReconnect();
    }
    throw error;
  }
};

module.exports = connectDB;
