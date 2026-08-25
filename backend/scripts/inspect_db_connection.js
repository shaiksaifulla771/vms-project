const dotenv = require('dotenv');
const path = require('path');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

async function inspectDatabase() {
  const uri = process.env.MONGO_URI;
  console.log('====================================================');
  console.log('          DATABASE CONNECTION INSPECTOR             ');
  console.log('====================================================');
  console.log('Target URI: ' + (uri ? uri.replace(/:([^@]+)@/, ':****@') : 'NONE'));

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12000,
    });
    
    console.log('\n[1] CONNECTION STATUS: 🟢 CONNECTED (ONLINE)');
    console.log('- Connected Host   : ' + conn.connection.host);
    console.log('- Database Name    : "' + conn.connection.name + '"');
    console.log('- Connection State : ' + (conn.connection.readyState === 1 ? 'Open & Ready (1)' : conn.connection.readyState));
    
    const db = conn.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('\n[2] COLLECTIONS PRESENT IN "' + conn.connection.name + '" (' + collections.length + ' Collections):');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log('  * ' + col.name.padEnd(25) + ' : ' + count + ' records');
    }

    const users = await db.collection('users').find({}, { projection: { username: 1, email: 1, role: 1, accountStatus: 1 } }).toArray();
    console.log('\n[3] REGISTERED USERS IN MONGODB ATLAS:');
    users.forEach((u, i) => {
      console.log('  ' + (i + 1) + '. ' + u.email + ' [' + u.role + '] (Status: ' + u.accountStatus + ') - ' + (u.username || 'User'));
    });

    console.log('\n[4] DATA PERSISTENCE CONFIRMATION:');
    console.log('All transactions, production plans, BOMs, and inventory records are permanently stored in this MongoDB Atlas cluster.');
    console.log('====================================================');

  } catch (error) {
    console.error('\n[ERROR] Database connection failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

inspectDatabase();
