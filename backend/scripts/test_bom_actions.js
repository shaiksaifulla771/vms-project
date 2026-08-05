const mongoose = require('mongoose');
const dotenv = require('dotenv');
const BOM = require('../models/BOM');
const connectDB = require('../config/db');

dotenv.config();

async function runTest() {
  await connectDB();
  
  const bom = await BOM.findOne().lean();
  if (!bom) {
    console.log('No BOMs found to test');
    process.exit(0);
  }

  try {
    const bomController = require('../controllers/bomController');
    const req = {
      params: { id: bom._id },
      user: { name: 'TestUser' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    
    const res = {
      status: (code) => {
        return {
          json: (data) => {
            console.log(`Response [${code}]:`, data);
          }
        }
      }
    };
    
    const next = (err) => {
      console.error('Next called with error:', err);
    };

    console.log('Testing duplicateBOM...');
    await bomController.duplicateBOM(req, res, next);

  } catch (err) {
    console.error('Test script crashed:', err);
  }

  process.exit(0);
}

runTest();
