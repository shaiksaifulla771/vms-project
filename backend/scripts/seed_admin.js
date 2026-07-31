const mongoose = require('mongoose');
const User = require('../models/User'); // Reuse the real schema to ensure hooks run

async function seedAdmin() {
  try {
    const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    console.log(`Connecting to DB for Admin seed: ${dbUri}`);
    await mongoose.connect(dbUri);
    
    const admin = await User.findOne({ role: 'Admin' });
    if (admin) {
      console.log('Admin user already exists. Skipping seed.');
    } else {
      console.log('Admin user not found. Seeding now...');
      await User.create({
        username: 'System Admin',
        email: 'admin@vms.com',
        password: 'admin123',
        role: 'Admin',
        isVerified: true
      });
      console.log('Successfully seeded Admin: admin@vms.com / admin123');
    }
  } catch (error) {
    console.error('Error seeding Admin user:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
