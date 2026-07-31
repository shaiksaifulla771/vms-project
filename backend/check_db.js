
const mongoose = require("mongoose");
const BOM = require("./models/BOM");
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new").then(async () => {
  const activeBoms = await BOM.find({ status: { $ne: "Deleted" } });
  const deletedBoms = await BOM.find({ status: "Deleted" });
  console.log("Active DB count:", activeBoms.length);
  console.log("Deleted DB count:", deletedBoms.length);
  process.exit(0);
});
