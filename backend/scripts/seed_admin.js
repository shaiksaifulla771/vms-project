const mongoose = require('mongoose');
const User = require('../models/User'); // Reuse the real schema to ensure hooks run

async function seedAdmin() {
  try {
    const dbUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms';
    console.log(`Connecting to DB for Admin seed: ${dbUri}`);
    await mongoose.connect(dbUri);

    const ensureUser = async ({ username, email, password, role }) => {
      let user = await User.findOne({ email }).select('+password');
      if (user) {
        user.username = username;
        user.password = password;
        user.role = role;
        user.requestedRole = role;
        user.accountStatus = 'Active';
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        user.refreshTokenHash = undefined;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        console.log(`Updated ${role}: ${email}`);
        return user;
      }

      user = await User.create({
        username,
        email,
        password,
        role,
        requestedRole: role,
        accountStatus: 'Active',
        isVerified: true
      });
      console.log(`Created ${role}: ${email}`);
      return user;
    };
    
    await ensureUser({
      username: 'System Admin',
      email: 'admin@vms.com',
      password: 'admin123',
      role: 'Admin'
    });

    await ensureUser({
      username: 'Shaik Saifulla',
      email: 'shaiksaifulla771@gmail.com',
      password: 'Saif@2005',
      role: 'Admin'
    });

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

    console.log('Admin credentials ready: shaiksaifulla771@gmail.com / Saif@2005');
  } catch (error) {
    console.error('Error seeding Admin/Manager users:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
