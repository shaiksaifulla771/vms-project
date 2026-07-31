const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });
const Vendor = require('./models/Vendor');
const Sequence = require('./models/Sequence');

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/vms';

async function testCreate() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Testing vendor creation in MongoDB...');

    const seqDoc = await Sequence.findById('vendorCode');
    let nextCode = 1001;
    if (seqDoc) nextCode = seqDoc.seq + 1;
    await Sequence.findByIdAndUpdate('vendorCode', { $set: { seq: nextCode } }, { upsert: true });
    const vendorId = `V${nextCode}`;

    const testEmail = `test.vendor.${Date.now()}@example.com`;
    const newVendor = await Vendor.create({
      vendorId,
      name: 'Test Vendor Co',
      company: 'Test Vendor Co Ltd',
      email: testEmail,
      phone: '9876543210',
      address: '123 Test St',
      category: 'Food Processor'
    });

    console.log('✅ Successfully created vendor in DB:', newVendor.vendorId, newVendor.name, newVendor.email);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Test Creation Failed:', err);
  }
}

testCreate();
