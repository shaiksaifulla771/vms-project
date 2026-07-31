
const mongoose = require("mongoose");
const BOM = require("./models/BOM");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");
  
  const boms = await BOM.find({ status: "Active" }).limit(1);
  if (boms.length > 0) {
    const bom = boms[0];
    bom.outputQuantity = bom.outputQuantity + 1;
    await bom.save();
    console.log("Successfully edited BOM outputQuantity to", bom.outputQuantity);
  } else {
    console.log("No active BOMs found.");
  }
  process.exit(0);
}
run();

