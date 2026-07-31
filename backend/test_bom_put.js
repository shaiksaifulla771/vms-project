
const mongoose = require("mongoose");
const BOM = require("./models/BOM");
const Material = require("./models/Material");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db";

async function runTests() {
  await mongoose.connect(MONGODB_URI);

  const matProduct = await Material.create({ name: "Product " + Date.now(), code: "P" + Date.now(), unit: "kg", type: "Finished" });
  const matComponent = await Material.create({ name: "Comp " + Date.now(), code: "C" + Date.now(), unit: "kg", type: "Raw Material" });
  
  let bom = await BOM.create({
    productId: matProduct._id,
    outputQuantity: 10,
    outputUnit: "kg",
    components: [{ materialId: matComponent._id, quantity: 1 }],
    status: "Active"
  });
  
  console.log("Created valid BOM.");

  const { updateBOM } = require("./controllers/bomController");
  
  const req = {
    params: { id: bom._id },
    body: {
      productId: matProduct._id,
      outputQuantity: 20,
      outputUnit: "kg",
      components: [{ materialId: matComponent._id, quantity: 2 }]
    }
  };
  const res = {
    status: (code) => {
      console.log("Update Status:", code);
      return { json: (data) => console.log("Update Response:", data) };
    }
  };
  
  try {
    await updateBOM(req, res, console.error);
  } catch (e) { console.error("Exception:", e); }

  await mongoose.disconnect();
}
runTests();

