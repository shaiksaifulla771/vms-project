
const mongoose = require("mongoose");
const Material = require("./models/Material");
const MPN = require("./models/MPN");
const Sequence = require("./models/Sequence");

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new").then(async () => {
  try {
    const matSeq = await Sequence.findById("materialCode");
    const mpnSeq = await Sequence.findById("mpnCode");
    console.log("--- CURRENT STORED SEQUENCES ---");
    console.log(`materialCode sequence: ${matSeq ? matSeq.seq : "Not Found"}`);
    console.log(`mpnCode sequence: ${mpnSeq ? mpnSeq.seq : "Not Found"}`);

    const allMats = await Material.find({}, "code");
    let maxMat = 1000;
    allMats.forEach(m => {
      const match = (m.code || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxMat) maxMat = num;
      }
    });
    console.log("--- ACTUAL MAX CODES (ALL INCLUDING DELETED) ---");
    console.log(`Max Material Code: M${maxMat}`);

    const allMpns = await MPN.find({}, "mpnCode");
    let maxMpn = 1000;
    allMpns.forEach(m => {
      const match = (m.mpnCode || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxMpn) maxMpn = num;
      }
    });
    console.log(`Max MPN Code: MPN${maxMpn}`);

    console.log("--- FIXING DISCREPANCY ---");
    if (!matSeq || matSeq.seq < maxMat) {
      console.log(`Updating materialCode sequence to ${maxMat}...`);
      await Sequence.findByIdAndUpdate("materialCode", { $set: { seq: maxMat } }, { upsert: true });
    }
    if (!mpnSeq || mpnSeq.seq < maxMpn) {
      console.log(`Updating mpnCode sequence to ${maxMpn}...`);
      await Sequence.findByIdAndUpdate("mpnCode", { $set: { seq: maxMpn } }, { upsert: true });
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
