
const mongoose = require("mongoose");
const PurchaseOrder = require("./models/PurchaseOrder");
const PurchaseRequest = require("./models/PurchaseRequest");
const Sequence = require("./models/Sequence");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db";

async function runTests() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  console.log("\n--- 1. Testing Purchase Order Auto-Sequence ---");
  
  await Sequence.findOneAndDelete({ _id: "purchaseOrder" });
  
  const dummyVendorId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyMaterialId = new mongoose.Types.ObjectId();

  const createPOWithSequence = async () => {
    const activePOs = await PurchaseOrder.find(
      { poNumber: /^PO-\d+$/i, isDeleted: { $ne: true } },
      { poNumber: 1 }
    );
    let maxNum = 1000;
    activePOs.forEach(p => {
      if (p.poNumber) {
        const match = p.poNumber.toString().match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    });
    const seqDoc = await Sequence.findById("purchaseOrder");
    const seqNum = (seqDoc && typeof seqDoc.seq === "number") ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;
    await Sequence.findByIdAndUpdate(
      "purchaseOrder",
      { $set: { seq: nextNum } },
      { upsert: true, new: true }
    );
    const poNumber = `PO-${nextNum}`;
    
    return await PurchaseOrder.create({
      poNumber,
      vendorId: dummyVendorId,
      materials: [{ materialId: dummyMaterialId, quantity: 10, unitPrice: 5 }],
      totalAmount: 50,
      requestedBy: dummyUserId,
      status: "Pending"
    });
  };

  const po1 = await createPOWithSequence();
  console.log(`Created PO 1: ${po1.poNumber}`);

  const po2 = await createPOWithSequence();
  console.log(`Created PO 2: ${po2.poNumber}`);

  console.log(`\nSoft deleting ${po2.poNumber}...`);
  po2.isDeleted = true;
  await po2.save();

  const po3 = await createPOWithSequence();
  console.log(`Created PO 3: ${po3.poNumber} (Should be PO-1003, verifying it does not reuse PO-1002 despite soft delete due to Sequence document storing 1002)`);

  console.log("\nChecking Sequence document:");
  const finalSeq = await Sequence.findById("purchaseOrder");
  console.log(`Sequence in DB: ${finalSeq.seq}`);

  console.log("\n--- 2. Testing Purchase Request Soft Delete ---");
  const pr = await PurchaseRequest.create({
    title: "Test PR",
    amount: 100, // Added missing required field
    vendorId: dummyVendorId,
    materials: [{ materialId: dummyMaterialId, quantity: 5, estimatedPrice: 10 }],
    requestedBy: dummyUserId,
    status: "Pending"
  });
  console.log(`Created PR: ${pr._id}`);

  console.log("Simulating controller soft delete...");
  pr.isDeleted = true;
  pr.status = "Deleted";
  await pr.save();

  const verifyPR = await PurchaseRequest.findById(pr._id);
  console.log(`Verified PR exists in DB: ${!!verifyPR}`);
  console.log(`PR isDeleted: ${verifyPR.isDeleted}`);
  console.log(`PR status: ${verifyPR.status}`);

  console.log("\n--- Cleaning up test data ---");
  await PurchaseOrder.deleteMany({ vendorId: dummyVendorId });
  await PurchaseRequest.deleteMany({ vendorId: dummyVendorId });
  
  await mongoose.disconnect();
  console.log("Done.");
}

runTests().catch(console.error);

