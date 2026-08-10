const mongoose = require('mongoose');
const User = require('../models/User'); // Reuse the real schema to ensure hooks run

async function seedAdmin() {
  try {
    const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    console.log(`Connecting to DB for Admin seed: ${dbUri}`);
    await mongoose.connect(dbUri);
    
    let admin = await User.findOne({ email: 'admin@vms.com' });
    if (admin) {
      admin.accountStatus = 'Active';
      admin.isVerified = true;
      await admin.save();
      console.log('Admin user updated to Active.');
    } else {
      console.log('Admin user not found. Seeding now...');
      await User.create({
        username: 'System Admin',
        email: 'admin@vms.com',
        password: 'admin123',
        role: 'Admin',
        accountStatus: 'Active',
        isVerified: true
      });
      console.log('Successfully seeded Admin: admin@vms.com / admin123');
    }

    let manager = await User.findOne({ email: 'manager@vms.com' });
    if (manager) {
      manager.accountStatus = 'Active';
      manager.isVerified = true;
      await manager.save();
      console.log('Manager user updated to Active.');
    } else {
      console.log('Manager user not found. Seeding now...');
      await User.create({
        username: 'Store Manager',
        email: 'manager@vms.com',
        password: 'manager123',
        role: 'Inventory Manager',
        accountStatus: 'Active',
        isVerified: true
      });
      console.log('Successfully seeded Manager: manager@vms.com / manager123');
    }
  } catch (error) {
    console.error('Error seeding Admin/Manager users:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
