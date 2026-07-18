const mongoose = require('mongoose');

/**
 * Synchronizes incoming Excel/CSV rows with MongoDB using upserts.
 * Treats the incoming data list as the "Source of Truth".
 * 
 * @param {mongoose.Model} Model The Mongoose model to sync to (e.g. Material)
 * @param {Array<Object>} items The raw items list from Excel
 * @param {Object} options Configuration options
 * @param {Array<string>} options.matchFields Fallback unique keys to match if _id is not present or valid (e.g. ['code'])
 * @param {Array<string>} options.excludeFields Fields that should never be overwritten (e.g. ['_id', '__v'])
 * @param {Object} options.defaultFields Default field-value mappings to apply to all inserted documents
 * @returns {Promise<Object>} Execution summary ({ success: true, result, insertedCount, updatedCount, errorsCount, errors })
 */
const syncExcelToMongoDB = async (Model, items, options = {}) => {
  const {
    matchFields = ['code'],
    excludeFields = ['_id', '__v', 'createdAt', 'updatedAt'],
    defaultFields = {}
  } = options;

  const bulkOps = [];
  const errors = [];
  const validItems = [];

  // 1. Process and convert incoming row values based on schema paths
  for (let i = 0; i < items.length; i++) {
    const rawItem = items[i];
    const cleanItem = {};

    try {
      // Automatic conversion based on Mongoose schema paths
      for (const [key, rawVal] of Object.entries(rawItem)) {
        if (rawVal === undefined || rawVal === null) continue;

        // Skip excluded fields
        if (excludeFields.includes(key)) continue;

        const valStr = rawVal.toString().trim();
        if (valStr === '') continue;

        const schemaPath = Model.schema.paths[key];
        if (schemaPath) {
          const type = schemaPath.instance;
          if (type === 'Number') {
            const parsed = Number(valStr);
            cleanItem[key] = isNaN(parsed) ? 0 : parsed;
          } else if (type === 'Date') {
            const parsed = new Date(valStr);
            cleanItem[key] = isNaN(parsed.getTime()) ? null : parsed;
          } else if (type === 'Boolean') {
            cleanItem[key] = ['true', '1', 'active', 'yes'].includes(valStr.toLowerCase());
          } else {
            cleanItem[key] = valStr;
          }
        } else {
          // Keep raw if not defined in schema paths
          cleanItem[key] = rawVal;
        }
      }

      // Preserve _id if valid MongoDB ObjectId
      if (rawItem._id && mongoose.Types.ObjectId.isValid(rawItem._id)) {
        cleanItem._id = new mongoose.Types.ObjectId(rawItem._id);
      }

      // Add default field values
      Object.assign(cleanItem, defaultFields);

      validItems.push(cleanItem);
    } catch (err) {
      errors.push(`Row ${i + 1} processing error: ${err.message}`);
    }
  }

  // 2. Construct BulkWrite operations
  validItems.forEach(item => {
    let filter = {};

    // Match by _id if present and valid
    if (item._id) {
      filter = { _id: item._id };
    } else {
      // Fallback to matchFields
      matchFields.forEach(field => {
        if (item[field] !== undefined) {
          if (typeof item[field] === 'string') {
            filter[field] = item[field].toUpperCase();
          } else {
            filter[field] = item[field];
          }
        }
      });
    }

    // Build update object, excluding matching fields and _id
    const updateFields = { ...item };
    delete updateFields._id;
    matchFields.forEach(field => delete updateFields[field]);

    // Format query filters consistently (case-insensitive for string keys)
    const matchFilter = {};
    for (const [k, v] of Object.entries(filter)) {
      if (typeof v === 'string') {
        matchFilter[k] = new RegExp(`^${v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
      } else {
        matchFilter[k] = v;
      }
    }

    // Set $setOnInsert for fields that were used in the match filter
    // This is required because matchFilter uses RegExp which cannot be inserted.
    const setOnInsertFields = {};
    matchFields.forEach(field => {
      if (item[field] !== undefined) {
        setOnInsertFields[field] = item[field];
      }
    });

    bulkOps.push({
      updateOne: {
        filter: matchFilter,
        update: {
          $set: updateFields,
          $setOnInsert: setOnInsertFields
        },
        upsert: true
      }
    });
  });

  if (bulkOps.length === 0) {
    return {
      success: true,
      insertedCount: 0,
      updatedCount: 0,
      errorsCount: errors.length,
      errors
    };
  }

  // 3. Execute bulk write
  const result = await Model.bulkWrite(bulkOps);

  const insertedCount = result.upsertedCount || 0;
  const updatedCount = (result.matchedCount || 0) - (result.upsertedCount || 0);

  return {
    success: true,
    result,
    insertedCount,
    updatedCount: Math.max(0, updatedCount),
    errorsCount: errors.length,
    errors
  };
};

module.exports = { syncExcelToMongoDB };
