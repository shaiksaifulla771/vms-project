const mongoose = require('mongoose');

const IdempotencyKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  requestHash: {
    type: String,
    required: false,
    trim: true,
  },
  method: {
    type: String,
    required: false,
  },
  path: {
    type: String,
    required: false,
  },
  statusCode: {
    type: Number,
    required: true,
    default: 200,
  },
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // 24-hour automatic TTL expiration
  },
});

module.exports = mongoose.model('IdempotencyKey', IdempotencyKeySchema);

