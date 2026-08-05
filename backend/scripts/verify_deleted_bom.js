const mongoose = require('mongoose');
const dotenv = require('dotenv');
const BOM = require('../models/BOM');
const connectDB = require('../config/db');
const bomController = require('../controllers/bomController');

dotenv.config();

async function runVerification() {
  await connectDB();
  console.log('--- DELETED BOM FILTER VERIFICATION TEST ---');

  // Find an existing BOM
  const existingBom = await BOM.findOne().lean();
  if (!existingBom) {
    console.log('❌ No BOM found to duplicate.');
    process.exit(1);
  }

  console.log(`✅ Step 1: Found existing BOM (${existingBom._id})`);

  // We will simulate the Duplicate BOM logic to create a valid temp BOM
  let tempBomId = null;
  const mockUserId = new mongoose.Types.ObjectId();
  const reqDup = {
    params: { id: existingBom._id },
    user: { name: 'TestUser', id: mockUserId },
    ip: '127.0.0.1'
  };
  const resDup = {
    status: (code) => ({
      json: (data) => {
        if (code === 201 && data.success) {
          tempBomId = data.data._id;
          console.log(`✅ Step 2: Duplicated BOM successfully. New ID: ${tempBomId}`);
        } else {
          console.error(`❌ Duplicate failed:`, data);
          process.exit(1);
        }
      }
    })
  };
  const nextDup = (err) => { console.error(err); process.exit(1); };

  await bomController.duplicateBOM(reqDup, resDup, nextDup);

  // Step 3: Delete the new BOM
  console.log(`\n▶ TEST: Delete BOM`);
  const reqDelete = {
    params: { id: tempBomId },
    user: { name: 'TestUser', id: mockUserId },
    ip: '127.0.0.1'
  };
  let deleteSuccess = false;
  const resDelete = {
    status: (code) => ({
      json: (data) => {
        if (code === 200 && data.success) {
          deleteSuccess = true;
          console.log(`  - Received 200 OK. BOM deleted/marked obsolete.`);
        } else {
          console.error(`  - Delete failed:`, data);
        }
      }
    })
  };
  await bomController.deleteBOM(reqDelete, resDelete, nextDup);

  // Step 4: Fetch BOMs with status='Deleted'
  console.log(`\n▶ TEST: Fetch BOMs with status='Deleted'`);
  const reqFetch = { query: { status: 'Deleted' } };
  const resFetch = {
    status: (code) => ({
      json: (data) => {
        if (code === 200 && data.success) {
          const found = data.data.find(b => b._id.toString() === tempBomId.toString());
          if (found) {
             console.log(`✅ SUCCESS: Our deleted BOM was successfully returned by the 'Deleted' filter!`);
             console.log(`  - BOM ID: ${found._id} | Status: ${found.status}`);
          } else {
             console.log(`❌ FAILED: Our deleted BOM was NOT found in the results.`);
          }
        } else {
          console.error(`❌ Fetch failed:`, data);
        }
      }
    })
  };
  await bomController.getBOMs(reqFetch, resFetch, nextDup);

  // Cleanup
  await BOM.deleteOne({ _id: tempBomId });
  console.log('\n✅ Cleanup complete. Test finished.');
  process.exit(0);
}

runVerification();
