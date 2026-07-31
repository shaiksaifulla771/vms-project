
const mongoose = require("mongoose");
const BOM = require("./models/BOM");
const Material = require("./models/Material");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db";

async function runTests() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  const mat = await Material.create({ name: "Dummy Material " + Date.now(), code: "DM" + Date.now(), unit: "kg", type: "Raw Material" });
  let bom = await BOM.create({
    productId: mat._id,
    outputQuantity: 10,
    outputUnit: "kg",
    components: [{ materialId: mat._id, quantity: 1 }],
    status: "Active"
  });
  
  console.log("Created BOM ID:", bom._id);
  
  // Test update
  const { updateBOM, deleteBOM } = require("./controllers/bomController");
  
  const req = {
    params: { id: bom._id },
    body: {
      outputQuantity: 20,
      outputUnit: "kg",
      components: [{ materialId: mat._id, quantity: 2 }]
    }
  };
  const res = {
    status: (code) => {
      console.log("Update Status:", code);
      return {
        json: (data) => console.log("Update Response:", data)
      };
    }
  };
  
  try {
    await updateBOM(req, res, console.error);
  } catch (e) { console.error("Update Exception:", e); }

  const delReq = { params: { id: bom._id } };
  const delRes = {
    status: (code) => {
      console.log("Delete Status:", code);
      return {
        json: (data) => console.log("Delete Response:", data)
      };
    }
  };

  try {
    await deleteBOM(delReq, delRes, console.error);
  } catch (e) { console.error("Delete Exception:", e); }

  await mongoose.disconnect();
}
runTests();

