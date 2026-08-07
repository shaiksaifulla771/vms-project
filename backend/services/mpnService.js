const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');
const Vendor = require('../models/Vendor');
const MPNPriceHistory = require('../models/MPNPriceHistory');

class MPNService {
  /**
   * Helper to normalize manufacturer name
   */
  static normalizeManufacturer(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  /**
   * Validates string fields against injection
   */
  static validateStringFields(body, fields) {
    for (const { name, label } of fields) {
      if (body[name] !== undefined && body[name] !== null) {
        if (typeof body[name] !== 'string') {
          return `${label} must be a valid string.`;
        }
      }
    }
    return null;
  }

  /**
   * Extracts MPN creation logic.
   */
  static async createMPN(data) {
    const stringTypeError = this.validateStringFields(data, [
      { name: 'manufacturerName', label: 'Manufacturer Name' },
      { name: 'mpnName', label: 'MPN Name' },
      { name: 'manufacturerPartNumber', label: 'Manufacturer Part Number' },
      { name: 'partDescription', label: 'Part Description' },
      { name: 'mpnCode', label: 'MPN Code' },
      { name: 'gstin', label: 'GSTIN' },
    ]);

    if (stringTypeError) {
      throw new Error(`Validation Error: ${stringTypeError}`);
    }

    const { status = 'Active', vendorId } = data;
    let { manufacturerName, manufacturerPartNumber } = data;

    manufacturerName = this.normalizeManufacturer(manufacturerName);
    if (typeof manufacturerPartNumber === 'string' && manufacturerPartNumber.trim()) {
      manufacturerPartNumber = manufacturerPartNumber.trim();
    } else {
      manufacturerPartNumber = data.mpnCode || 'MPN-AUTO';
    }

    data.manufacturerName = manufacturerName;
    data.manufacturerPartNumber = manufacturerPartNumber;

    if (vendorId) {
      const vendorDoc = await Vendor.findById(vendorId);
      if (vendorDoc && vendorDoc.gstin && vendorDoc.gstin.trim()) {
        data.gstin = '';
      }
    }

    if (data.price === undefined && data.unitPrice !== undefined) {
      data.price = data.unitPrice;
    }

    if (status === 'Draft' && (data.price === undefined || data.price === null)) {
      data.price = 1;
    }

    if (status !== 'Draft') {
      if (!manufacturerName) {
        throw new Error('Validation Error: Manufacturer Name is required');
      }
      if (!data.materialId) {
        throw new Error('Validation Error: Please link a Material');
      }
      if (!vendorId) {
        throw new Error('Validation Error: Please link a Vendor');
      }
      if (data.price === undefined || data.price === null || Number(data.price) <= 0) {
        throw new Error('Validation Error: Price is required and must be greater than 0');
      }
      if (!data.moq || data.moq < 1) {
        throw new Error('Validation Error: MOQ must be at least 1');
      }

      const existing = await MPN.findOne({
        status: { $ne: 'Deleted' },
        vendorId,
        manufacturerName: { $regex: new RegExp(`^${manufacturerName}$`, 'i') },
        manufacturerPartNumber: { $regex: new RegExp(`^${manufacturerPartNumber}$`, 'i') },
      });

      if (existing) {
        throw new Error(`Duplicate Error: A part with Manufacturer '${manufacturerName}' and Part Number '${manufacturerPartNumber}' is already registered for this Vendor.`);
      }
    }

    if (!data.mpnCode) {
      const activeMPNs = await MPN.find(
        { mpnCode: /^MPN\d{4}$/i, status: { $ne: 'Deleted' } },
        { mpnCode: 1 }
      );
      let maxNum = 1000;
      activeMPNs.forEach((m) => {
        if (m.mpnCode) {
          const num = parseInt(m.mpnCode.substring(3), 10);
          if (!isNaN(num) && num < 10000 && num > maxNum) maxNum = num;
        }
      });
      const seqDoc = await Sequence.findOne({ $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] });
      const seqNum = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
      const finalMax = Math.max(maxNum, seqNum);
      data.mpnCode = `MPN${finalMax + 1}`;
    }

    if (data.mpnCode) {
      const existingMpn = await MPN.findOne({ mpnCode: data.mpnCode });
      if (existingMpn) {
        throw new Error(`Duplicate Error: MPN with code '${data.mpnCode}' already exists.`);
      }
    }
    
    const mpn = await MPN.create(data);
    
    const match = mpn.mpnCode.match(/^MPN(\d{4})$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= 1000 && num < 10000) {
        const seqDoc = await Sequence.findById('mpnCode');
        const currentSeq = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
        if (num > currentSeq) {
          await Sequence.findByIdAndUpdate(
            'mpnCode',
            { $set: { seq: num } },
            { upsert: true, new: true }
          );
        }
      }
    }

    if (mpn.price !== undefined && mpn.price !== null) {
      await MPNPriceHistory.create({
        mpnId: mpn._id,
        previousPrice: null,
        newPrice: mpn.price,
        effectiveDate: new Date(),
        modifiedBy: 'System'
      });
    }
    
    return mpn;
  }
}

module.exports = MPNService;
