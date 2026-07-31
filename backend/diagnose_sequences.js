
const mongoose = require("mongoose");
const Material = require("./models/Material");
const MPN = require("./models/MPN");
const Sequence = require("./models/Sequence");

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vms-db-new").then(async () => {
  try {
    const matSeq = await Sequence.findById("materialCode");
    const mpnSeq = await Sequence.findById("mpnCode");
    console.log("--- SEQUENCE COLLECTION ---");
    console.log(`materialCode sequence: ${matSeq ? matSeq.seq : "Not Found"}`);
    console.log(`mpnCode sequence: ${mpnSeq ? mpnSeq.seq : "Not Found"}`);

    const activeMats = await Material.find({ status: { $ne: "Deleted" } }, "code");
    let maxMat = 1000;
    activeMats.forEach(m => {
      const match = (m.code || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxMat) maxMat = num;
      }
    });
    console.log("--- ACTUAL MAX CODES (ACTIVE) ---");
    console.log(`Max Active Material Code: M${maxMat}`);

    const activeMpns = await MPN.find({ status: { $ne: "Deleted" } }, "mpnCode");
    let maxMpn = 1000;
    activeMpns.forEach(m => {
      const match = (m.mpnCode || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxMpn) maxMpn = num;
      }
    });
    console.log(`Max Active MPN Code: MPN${maxMpn}`);

    console.log("--- DISCREPANCY ANALYSIS ---");
    let changed = false;
    if (!matSeq || matSeq.seq < maxMat) {
      console.log(`Material sequence drifted! Fixing materialCode sequence to ${maxMat}...`);
      await Sequence.findByIdAndUpdate("materialCode", { $set: { seq: maxMat } }, { upsert: true });
      changed = true;
    }
    if (!mpnSeq || mpnSeq.seq < maxMpn) {
      console.log(`MPN sequence drifted! Fixing mpnCode sequence to ${maxMpn}...`);
      await Sequence.findByIdAndUpdate("mpnCode", { $set: { seq: maxMpn } }, { upsert: true });
      changed = true;
    }

    console.log(changed ? "Sequences reset successfully." : "No sequence drift detected based on max active.");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
