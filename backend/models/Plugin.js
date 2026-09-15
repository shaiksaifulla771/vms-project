const mongoose = require('mongoose');

const PluginSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, index: true },
  version: { type: String, required: true, default: '1.0.0' },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Error'],
    default: 'Active',
    index: true
  },
  configuration: { type: mongoose.Schema.Types.Mixed, default: {} },
  healthStatus: { type: String, enum: ['Healthy', 'Degraded', 'Unhealthy'], default: 'Healthy' },
  lastHealthCheck: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Plugin', PluginSchema);
