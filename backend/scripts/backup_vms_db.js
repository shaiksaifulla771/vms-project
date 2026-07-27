const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function dumpDatabase() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vms');
  const backupDir = path.join(__dirname, 'backup_json');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const col of collections) {
    const data = await mongoose.connection.db.collection(col.name).find({}).toArray();
    const filePath = path.join(backupDir, `${col.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Backed up collection '${col.name}': ${data.length} documents saved to ${filePath}`);
  }

  await mongoose.disconnect();
  console.log("Full MongoDB JSON backup completed successfully!");
}

dumpDatabase();
