const mongoose = require('mongoose');
const InventoryItem = require('./InventoryItem');

// Export the existing InventoryItem model under the Inventory alias for Phase 1 modernization
module.exports = mongoose.models.Inventory || mongoose.model('Inventory', InventoryItem.schema);
