
const axios = require("axios");
const mongoose = require("mongoose");
const BOM = require("./models/BOM");

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new").then(async () => {
  const activeBoms = await BOM.find({ status: { $ne: "Deleted" } }).populate("productId");
  const deletedBoms = await BOM.find({ status: "Deleted" }).populate("productId");
  console.log("Active Product Names:", activeBoms.map(b => b.productId ? b.productId.name : "null"));
  console.log("Deleted Product Names:", deletedBoms.map(b => b.productId ? b.productId.name : "null"));
  process.exit(0);
});
