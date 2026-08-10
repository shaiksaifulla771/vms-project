const mongoose = require('mongoose');

const sequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Sequence name e.g. 'vendorCode', 'materialCode', 'poNumber', 'prdNumber'
  seq: { type: Number, default: 1000 },
  prefix: { type: String, default: '' },
  padLength: { type: Number, default: 4 },
  lastGeneratedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sequence', sequenceSchema);
