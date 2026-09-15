const mongoose = require('mongoose');

const MpnSchema = new mongoose.Schema({}, { strict: false, collection: 'mpns' });
const MPN = mongoose.model('MPN', MpnSchema);

async function runMigration() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/antigravity';
  try {
    console.log('Connecting to database for MPN legacy schema purge...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully.');

    const result = await MPN.updateMany(
      {},
      {
        $unset: {
          price: "",
          mpnPrice: "",
          priceHistory: ""
        }
      }
    );

    console.log(`Migration Complete: Cleaned and updated ${result.modifiedCount} legacy MPN documents.`);
  } catch (error) {
    console.error('Migration runtime failure:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection cleanly released.');
  }
}

runMigration();
