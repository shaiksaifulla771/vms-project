const sodMatrix = require('../config/sodMatrix');

exports.checkSoD = (actionType) => async (req, res, next) => {
  const conflicts = sodMatrix.filter(rule => rule.action === actionType);
  if (!conflicts.length) return next();
  
  // The entity document should be loaded by prior middleware or fetched here
  // For now, the approval engine will pass the entity
  req.sodChecks = conflicts;
  next();
};
