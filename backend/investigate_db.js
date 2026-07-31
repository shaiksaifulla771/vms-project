
require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new";
console.log("=== CONNECTION URI ===");
console.log(uri);

mongoose.connect(uri).then(async () => {
  try {
    const db = mongoose.connection.db;

    const materialsCount = await db.collection("materials").countDocuments({});
    console.log("\n=== TRUE MATERIALS COUNT ===");
    console.log(materialsCount);

    const m1039 = await db.collection("materials").findOne({ code: "M1039" });
    console.log("\n=== FIND M1039 ===");
    console.log(m1039 ? JSON.stringify(m1039, null, 2) : "Not Found");

    const mpnsCount = await db.collection("mpns").countDocuments({});
    console.log("\n=== TRUE MPNS COUNT ===");
    console.log(mpnsCount);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
