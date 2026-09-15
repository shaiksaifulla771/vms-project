module.exports = [
  { action: 'APPROVE_PO', conflictsWith: 'CREATE_PO', field: 'requestedBy' },
  { action: 'APPROVE_PR', conflictsWith: 'CREATE_PR', field: 'requestedBy' },
  { action: 'APPROVE_INVENTORY_ADJUSTMENT', conflictsWith: 'CREATE_INVENTORY_ADJUSTMENT', field: 'userId' },
  { action: 'APPROVE_VENDOR', conflictsWith: 'CREATE_VENDOR', field: 'createdBy' },
  { action: 'APPROVE_PRODUCTION_ORDER', conflictsWith: 'CREATE_PRODUCTION_ORDER', field: 'createdBy' },
];
