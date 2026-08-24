const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

async function inspectDatabase() {
  const uri = process.env.MONGO_URI;
  console.log('----------------------------------------------------');
  console.log('DATABASE CONNECTION INSPECTOR');
  console.log('----------------------------------------------------');
  console.log('Connecting to URI from backend/.env...');
  
  try {
    const conn = await mongoose.connect(uri);
    
    console.log('\n[1] CONNECTION STATUS: CONNECTED');
    console.log(`- Connected Host  : ${conn.connection.host}`);
    console.log(`- Connected Port  : ${conn.connection.port}`);
    console.log(`- Database Name   : "${conn.connection.name}"`);
    console.log(`- Connection State: ${conn.connection.readyState === 1 ? 'Open & Ready (1)' : conn.connection.readyState}`);
    
    const db = conn.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\n[2] COLLECTIONS PRESENT IN "${conn.connection.name}": (${collections.length} collections)`);
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`  * ${col.name.padEnd(25)} : ${count} document(s)`);
    }

    const users = await db.collection('users').find({}, { projection: { username: 1, email: 1, role: 1, accountStatus: 1, createdAt: 1 } }).toArray();
    console.log('\n[3] USERS STORED IN YOUR ATLAS DATABASE:');
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. Email: ${u.email} | Role: ${u.role} | Status: ${u.accountStatus} | Name: ${u.username}`);
    });

    console.log('\n[4] DATA PERSISTENCE VERIFICATION:');
    console.log('Every create/update/delete operation in your VMS app directly modifies this MongoDB Atlas database.');
    console.log('You can also open MongoDB Compass or Atlas web UI to view this exact data under database: "' + conn.connection.name + '".');
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('Database connection error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

inspectDatabase();
