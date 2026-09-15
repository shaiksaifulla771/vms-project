const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Vendor = require('./models/Vendor');
const VendorMaster = require('./models/VendorMaster');

async function seedVendors() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/vms-db');
    console.log('Connected to MongoDB.');

    const recipePath = path.join(__dirname, 'config', 'all_recipes.json');
    if (!fs.existsSync(recipePath)) {
      console.error('Recipe file not found!');
      process.exit(1);
    }

    const rawData = fs.readFileSync(recipePath, 'utf8');
    const parsedData = JSON.parse(rawData);

    console.log(`Seeding ${parsedData.vendors.length} vendors into database...`);

    const vendorMasterDocs = [];
    const vendorDocs = [];

    let idx = 1001;
    for (let vendorName of parsedData.vendors) {
      const slug = vendorName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email = `contact@${slug || 'sourcing'}.com`;
      const vId = `VND-${idx}`;
      const taxId = `27${(slug + 'ABCDE').slice(0, 5).toUpperCase()}1234F${(idx % 9) + 1}Z5`;

      let dept = 'Procurement';
      let role = 'Sourcing Specialist';

      if (vendorName.toLowerCase().includes('agro') || vendorName.toLowerCase().includes('traders') || vendorName.toLowerCase().includes('fruits')) {
        dept = 'Procurement';
        role = 'Buyer';
      } else if (vendorName.toLowerCase().includes('pack') || vendorName.toLowerCase().includes('flex') || vendorName.toLowerCase().includes('print')) {
        dept = 'Logistics';
        role = 'Supply Chain Coordinator';
      } else if (vendorName.toLowerCase().includes('health') || vendorName.toLowerCase().includes('chem') || vendorName.toLowerCase().includes('starch')) {
        dept = 'Legal';
        role = 'Compliance Officer';
      } else if (vendorName.toLowerCase().includes('brand') || vendorName.toLowerCase().includes('store')) {
        dept = 'Finance';
        role = 'Financial Controller';
      }

      vendorMasterDocs.push({
        Vendor_ID: vId,
        Company_Name: vendorName,
        Tax_ID: taxId,
        Contact_Email: email,
        Department: dept,
        Role: role,
        Status: 'Active',
        is_deleted: false,
        contacts: [
          {
            name: `${vendorName.split(' ')[0]} Representative`,
            phone: `+91 98765 ${idx}`,
            role: role,
            department: dept,
            email: email
          }
        ]
      });

      vendorDocs.push({
        vendorId: `V${idx}`,
        name: vendorName,
        company: vendorName,
        email: email,
        phone: `+91 98765 ${idx}`,
        gstin: taxId,
        category: 'Supplier',
        status: 'Active',
        contacts: [
          {
            name: `${vendorName.split(' ')[0]} Representative`,
            phone: `+91 98765 ${idx}`,
            role: role,
            department: dept,
            email: email
          }
        ]
      });

      idx++;
    }

    await VendorMaster.deleteMany({});
    await VendorMaster.insertMany(vendorMasterDocs);

    await Vendor.deleteMany({});
    await Vendor.insertMany(vendorDocs);

    console.log(`SUCCESSFULLY SEEDED ${vendorMasterDocs.length} VENDORS INTO BOTH COLLECTIONS!`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Seeding error:', err);
  }
}

seedVendors();
