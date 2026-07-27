const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !process.env.MONGO_URI) {
      console.error('FATAL ERROR: MONGO_URI environment variable is required when NODE_ENV=production.');
      process.exit(1);
    }
    const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    const conn = await mongoose.connect(connStr);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
