const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const MaterialSchema = new Schema({
  name: String,
  code: String,
});
const Material = mongoose.model('Material', MaterialSchema);
async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/vms');
  const list = await Material.find({ code: /^2001-/ }).limit(20);
  console.log("DB_CHECK_START");
  list.forEach(m => {
    console.log("CODE_LINE: " + m.code + " | " + m.name);
  });
  console.log("DB_CHECK_END");
  await mongoose.disconnect();
}
run().catch(console.error);
