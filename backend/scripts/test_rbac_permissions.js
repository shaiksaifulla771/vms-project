const axios = require('axios');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000/api';

async function testRBAC() {
  console.log('--- Starting RBAC Permissions Test ---');
  let userToken = null;
  let testEmail = `vendor_test_${Date.now()}@example.com`;

  try {
    // 1. Register a Vendor user
    console.log(`Registering Vendor user with email: ${testEmail}...`);
    const registerRes = await axios.post(`${BASE_URL}/auth/register`, {
      username: 'Vendor QA Tester',
      email: testEmail,
      password: 'password123',
      role: 'Vendor'
    });
    
    userToken = registerRes.data.token;
    console.log('Registration successful! Token acquired.');

    // 2. Attempt to hit the admin-only route
    console.log('Attempting to access GET /api/auth/admin-only ...');
    await axios.get(`${BASE_URL}/auth/admin-only`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });

    console.error('❌ FAIL: The Vendor was incorrectly allowed to access the admin-only route!');
    process.exit(1);

  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ PASS: Vendor was correctly denied access (403 Forbidden).');
      console.log(`Response error message: ${error.response.data.error}`);
    } else if (error.response) {
      console.error(`❌ FAIL: Expected 403, but got ${error.response.status}`);
      console.error(error.response.data);
      process.exit(1);
    } else {
      console.error('❌ FAIL: Network or other error occurred.');
      console.error(error.message);
      process.exit(1);
    }
  } finally {
    console.log('--- RBAC Permissions Test Completed ---');
  }
}

testRBAC();
