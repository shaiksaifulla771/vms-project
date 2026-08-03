const mongoose = require('mongoose');
const BOMComponentSchema = new mongoose.Schema({
  mpnId: { type: mongoose.Schema.Types.ObjectId, required: true },
  qty: { type: Number, required: true, min: 0.0001 },
  lossPercent: { type: Number, default: 0 }
}, { _id: false });

const BOMSchema = new mongoose.Schema({
  components: {
    type: [BOMComponentSchema],
    validate: {
      validator: function(v) {
        console.log("VALIDATOR CALLED WITH v:", v);
        return v && v.length > 0;
      },
      message: 'At least one component is required'
    }
  }
});

const BOM = mongoose.model('BOM_TEST', BOMSchema);

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms_test');
  try {
    const bom = new BOM({
      components: [ { mpnId: new mongoose.Types.ObjectId(), qty: 1 } ]
    });
    console.log("BEFORE VALIDATE");
    await bom.validate();
    console.log("VALIDATION PASSED");
  } catch (err) {
    console.error("VALIDATION FAILED:", err.message);
  }
  await mongoose.disconnect();
}
test();
