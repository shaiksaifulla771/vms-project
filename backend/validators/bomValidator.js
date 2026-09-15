exports.validateBomRecipe = (req, res, next) => {
  const { productId, batchSize, batchUOM, components } = req.body;
  const errors = [];

  if (!productId) {
    errors.push('Assembly product reference (productId) is required.');
  }

  if (batchSize === undefined || batchSize === null || Number(batchSize) <= 0) {
    errors.push('Batch size must be greater than zero.');
  }

  if (!batchUOM || typeof batchUOM !== 'string' || !batchUOM.trim()) {
    errors.push('Batch UOM is required.');
  }

  if (!components || !Array.isArray(components) || components.length === 0) {
    errors.push('A BOM must include at least one component.');
  } else {
    // Check for duplicate MPNs
    const mpnSet = new Set();
    components.forEach((comp, index) => {
      if (!comp.mpnId) {
        errors.push(`Component at row ${index + 1} is missing an MPN reference.`);
      } else {
        if (mpnSet.has(comp.mpnId)) {
          errors.push(`Duplicate MPN found in recipe: ${comp.mpnId}`);
        }
        mpnSet.add(comp.mpnId);
      }

      if (comp.qty === undefined || comp.qty === null || Number(comp.qty) <= 0) {
        errors.push(`Quantity must be greater than zero for row ${index + 1}.`);
      }

      const loss = Number(comp.lossPercent || 0);
      if (loss < 0 || loss > 99) {
        errors.push(`Loss percent must be between 0 and 99 for row ${index + 1}.`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join(' ') });
  }

  // Validate optional costs if provided
  const { packagingCost, processingCost, overheadCost } = req.body;
  if (packagingCost !== undefined && Number(packagingCost) < 0) {
    return res.status(400).json({ success: false, error: 'Packaging Cost cannot be negative.' });
  }
  if (processingCost !== undefined && Number(processingCost) < 0) {
    return res.status(400).json({ success: false, error: 'Processing Cost cannot be negative.' });
  }
  if (overheadCost !== undefined && Number(overheadCost) < 0) {
    return res.status(400).json({ success: false, error: 'Overhead Cost cannot be negative.' });
  }

  next();
};
