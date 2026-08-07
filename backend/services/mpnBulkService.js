const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');
const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
const MPNPriceHistory = require('../models/MPNPriceHistory');
const MPNService = require('./mpnService');

class MPNBulkService {
  /**
   * Extracted bulk creation logic preserving row-by-row partial success behavior.
   * NOTE: This algorithm is known to exhibit N+1 query patterns and will require
   * a MongoDB bulkWrite refactoring in a future scalability phase.
   */
  static async bulkCreate(rows, user) {
    if (!Array.isArray(rows)) {
      throw new Error('Validation Error: Input must be an array of rows');
    }

    if (!rows.length) {
      throw new Error('Validation Error: Please provide an array of MPN rows to create.');
    }

    if (rows.length > 500) {
      throw new Error('Validation Error: Bulk payload exceeds maximum allowed cap of 500 rows.');
    }

    // Extract unique vendor and material IDs for batch validation
    const vendorIds = [...new Set(rows.map((r) => r.vendorId).filter(Boolean))];
    const materialIds = [...new Set(rows.map((r) => r.materialId).filter(Boolean))];

    const [activeVendors, activeMaterials] = await Promise.all([
      Vendor.find({ _id: { $in: vendorIds }, status: { $ne: 'Deleted' } }, { _id: 1, gstin: 1, name: 1, company: 1 }),
      Material.find({ _id: { $in: materialIds }, status: { $ne: 'Deleted' } }, { _id: 1, name: 1 }),
    ]);

    const activeVendorMap = new Map(activeVendors.map((v) => [v._id.toString(), v]));
    const activeMaterialMap = new Map(activeMaterials.map((m) => [m._id.toString(), m]));

    // Pre-calculate needed sequence block size for rows missing explicit mpnCode
    const rowsNeedingCode = rows.filter((r) => !r.mpnCode);
    const codeNeededCount = rowsNeedingCode.length;

    let nextCodeSeq = 1001;
    if (codeNeededCount > 0) {
      const activeMPNs = await MPN.find(
        { mpnCode: /^MPN\d{4,}$/i, status: { $ne: 'Deleted' } },
        { mpnCode: 1 }
      );
      let maxNum = 1000;
      activeMPNs.forEach((m) => {
        if (m.mpnCode) {
          const num = parseInt(m.mpnCode.substring(3), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });

      const seqDoc = await Sequence.findOne({ $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] });
      const currentSeq = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
      const startNum = Math.max(maxNum, currentSeq);

      // Atomically allocate the block of sequence numbers
      await Sequence.findOneAndUpdate(
        { _id: 'mpnCode' },
        { $set: { name: 'mpnCode', seq: startNum + codeNeededCount } },
        { upsert: true, new: true }
      );

      nextCodeSeq = startNum + 1;
    }

    const results = [];
    let successCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const temp_id = row.temp_id || `temp-${index}-${Date.now()}`;
      const status = row.status || 'Active';

      try {
        // String type safety validation
        const stringTypeError = MPNService.validateStringFields(row, [
          { name: 'manufacturerName', label: 'Manufacturer Name' },
          { name: 'mpnName', label: 'MPN Name' },
          { name: 'manufacturerPartNumber', label: 'Manufacturer Part Number' },
          { name: 'partDescription', label: 'Part Description' },
          { name: 'mpnCode', label: 'MPN Code' },
          { name: 'gstin', label: 'GSTIN' },
        ]);

        if (stringTypeError) {
          results.push({ temp_id, status: 'error', error: stringTypeError });
          continue;
        }

        let mfrName = MPNService.normalizeManufacturer(row.manufacturerName);
        let mfrPartNum = (typeof row.manufacturerPartNumber === 'string' && row.manufacturerPartNumber.trim())
          ? row.manufacturerPartNumber.trim()
          : (row.mpnName || 'MPN-AUTO');

        if (status !== 'Draft') {
          if (!row.materialId) {
            results.push({ temp_id, status: 'error', error: 'Please link a valid Material' });
            continue;
          }
          if (!row.vendorId) {
            results.push({ temp_id, status: 'error', error: 'Please link a valid Vendor' });
            continue;
          }
          if (!activeMaterialMap.has(row.materialId.toString())) {
            results.push({ temp_id, status: 'error', error: 'Linked Material is inactive or no longer exists' });
            continue;
          }
          if (!activeVendorMap.has(row.vendorId.toString())) {
            results.push({ temp_id, status: 'error', error: 'Linked Vendor is inactive or no longer exists' });
            continue;
          }
          if (row.price === undefined || row.price === null || Number(row.price) <= 0) {
            results.push({ temp_id, status: 'error', error: 'Price is required and must be greater than 0' });
            continue;
          }
        }

        // Determine MPN Code
        let codeToUse = row.mpnCode;
        if (!codeToUse) {
          codeToUse = `MPN${nextCodeSeq++}`;
        }

        // Check if explicit or assigned code already exists
        const codeExist = await MPN.findOne({ mpnCode: codeToUse });
        if (codeExist) {
          results.push({ temp_id, status: 'error', error: `MPN Code '${codeToUse}' already exists.` });
          continue;
        }

        const vendorDoc = activeVendorMap.get(row.vendorId?.toString());
        let gstinVal = row.gstin || '';
        if (vendorDoc && vendorDoc.gstin && vendorDoc.gstin.trim()) {
          gstinVal = '';
        }

        const mpnDoc = await MPN.create({
          mpnCode: codeToUse,
          manufacturerPartNumber: mfrPartNum,
          mpnName: row.mpnName || mfrPartNum,
          manufacturerName: mfrName || 'GENERIC',
          isDirectFromManufacturer: Boolean(row.isDirectFromManufacturer),
          materialId: row.materialId || null,
          vendorId: row.vendorId || null,
          price: Number(row.price) || 0,
          moq: Number(row.moq) || 1,
          gstin: gstinVal,
          partDescription: row.partDescription || '',
          status: status,
        });

        // Record initial price history if price provided
        if (Number(row.price) > 0) {
          await MPNPriceHistory.create({
            mpnId: mpnDoc._id,
            previousPrice: null,
            newPrice: Number(row.price),
            effectiveDate: new Date(),
            modifiedBy: user ? (user.name || user.username || 'System Admin') : 'System',
          });
        }

        results.push({
          temp_id,
          status: 'success',
          mpnCode: mpnDoc.mpnCode,
          data: mpnDoc,
        });
        successCount++;
      } catch (err) {
        let errMessage = err.message || 'Failed to save MPN row';
        if (err.code === 11000) {
          errMessage = 'Duplicate key error (MPN code or Manufacturer part number already registered)';
        }
        results.push({
          temp_id,
          status: 'error',
          error: errMessage,
        });
      }
    }

    return {
      successCount,
      totalCount: rows.length,
      results
    };
  }
}

module.exports = MPNBulkService;
