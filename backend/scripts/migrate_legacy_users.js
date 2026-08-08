const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');

const migrateLegacyAdmins = async () => {
  try {
    const isTest = process.env.NODE_ENV === 'test';
    const uri = isTest ? process.env.TEST_MONGODB_URI : (process.env.PRODUCTION_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
    
    if (!uri) {
      console.error('No MongoDB URI found in environment variables.');
      process.exit(1);
    }
    
    console.log(`Connecting to MongoDB... (${isTest ? 'TEST DB' : 'PROD DB'})`);
    await mongoose.connect(uri);
    console.log('Connected successfully.\n');

    if (isDryRun) {
      console.log('=== DRY RUN MODE: No data will be modified ===\n');
    }

    const query = { 
      role: 'Admin', 
      isVerified: true, 
      accountStatus: { $exists: false } 
    };

    const legacyAdmins = await User.find(query);
    console.log(`Found ${legacyAdmins.length} legacy Admin account(s) requiring migration.\n`);

    for (const admin of legacyAdmins) {
      console.log(`[TARGET] ID: ${admin._id} | Email: ${admin.email} | Created At: ${admin.createdAt}`);
    }

    if (legacyAdmins.length > 0 && !isDryRun) {
      console.log('\nExecuting migration...');
      const result = await User.updateMany(query, { $set: { accountStatus: 'Active' } });
      console.log(`Migration complete. Modified ${result.modifiedCount} document(s).`);
    } else if (legacyAdmins.length > 0 && isDryRun) {
      console.log('\nDry run complete. Run without --dry-run to apply changes.');
    } else {
      console.log('\nNo legacy Admin accounts need migration. Migration is idempotent and safe to run multiple times.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateLegacyAdmins();
