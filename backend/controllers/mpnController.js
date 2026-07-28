const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');
const XLSX = require('xlsx');
const { generateSingleMpnPDF } = require('../utils/pdfGenerator');

// Helper to normalize manufacturer name (trim and case-normalize to uppercase)
const normalizeManufacturer = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
};

// Helper to validate string fields against object/array injection payloads
const validateStringFields = (body, fields) => {
  for (const { name, label } of fields) {
    if (body[name] !== undefined && body[name] !== null) {
      if (typeof body[name] !== 'string') {
        return `${label} must be a valid string.`;
      }
    }
  }
  return null;
};

// Helper to build filter query matching all 4 grid filters
const buildMpnQuery = (queryParams) => {
  const { search, status, materialId, vendorId } = queryParams;
  const filter = {};

  if (status && status !== 'All') {
    filter.status = status;
  } else {
    filter.status = { $ne: 'Deleted' };
  }

  if (materialId) {
    filter.materialId = materialId;
  }

  if (vendorId) {
    filter.vendorId = vendorId;
  }

  return filter;
};

// @desc    Get non-deleted MPNs (accepts 4 filters: search, status, materialId, vendorId)
// @route   GET /api/mpns
exports.getMPNs = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = buildMpnQuery(req.query);

    let mpns = await MPN.find(filter)
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin')
      .sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      mpns = mpns.filter((r) => {
        const matName = r.materialId?.name || '';
        const matCode = r.materialId?.code || '';
        const venName = r.vendorId?.name || '';
        const venComp = r.vendorId?.company || '';
        const haystack = [
          r.mpnCode,
          r.manufacturerPartNumber,
          r.mpnName,
          r.manufacturerName,
          matName,
          matCode,
          venName,
          venComp,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(term);
      });
    }

    res.status(200).json({ success: true, count: mpns.length, data: mpns });
  } catch (err) {
    next(err);
  }
};

// @desc    Get soft-deleted MPNs
// @route   GET /api/mpns/deleted
exports.getDeletedMPNs = async (req, res, next) => {
  try {
    const mpns = await MPN.find({ status: 'Deleted' })
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: mpns.length, data: mpns });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single MPN
// @route   GET /api/mpns/:id
exports.getMPN = async (req, res, next) => {
  try {
    const mpn = await MPN.findById(req.params.id)
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin');

    if (!mpn) {
      return res.status(404).json({ success: false, error: 'MPN record not found' });
    }
    res.status(200).json({ success: true, data: mpn });
  } catch (err) {
    next(err);
  }
};

// @desc    Peek next MPN code without incrementing
// @route   GET /api/mpns/sequence-peek
exports.peekNextMPNCode = async (req, res, next) => {
  try {
    const allMPNs = await MPN.find(
      { mpnCode: /^MPN\d{4}$/i },
      { mpnCode: 1 }
    );

    let maxNum = 1000;
    allMPNs.forEach((m) => {
      if (m.mpnCode) {
        const num = parseInt(m.mpnCode.substring(3), 10);
        if (!isNaN(num) && num < 10000 && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const seqDoc = await Sequence.findOne({ $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] });
    const seqNum = seqDoc && seqDoc.seq < 10000 ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;

    res.status(200).json({ success: true, nextCode: `MPN${nextNum}` });
  } catch (err) {
    next(err);
  }
};

// @desc    Get distinct manufacturer names for autocomplete
// @route   GET /api/mpns/manufacturers
exports.getManufacturers = async (req, res, next) => {
  try {
    const names = await MPN.distinct('manufacturerName', { status: { $ne: 'Deleted' } });
    const normalized = Array.from(
      new Set(names.map((n) => normalizeManufacturer(n)).filter(Boolean))
    ).sort();

    res.status(200).json({ success: true, count: normalized.length, data: normalized });
  } catch (err) {
    next(err);
  }
};

// @desc    Create MPN (single save path, status drives validation strictness)
// @desc    Create MPN (single save path, status drives validation strictness)
// @route   POST /api/mpns
exports.createMPN = async (req, res, next) => {
  try {
    // Validate type for string fields against object/array injection payloads
    const stringTypeError = validateStringFields(req.body, [
      { name: 'manufacturerName', label: 'Manufacturer Name' },
      { name: 'mpnName', label: 'MPN Name' },
      { name: 'manufacturerPartNumber', label: 'Manufacturer Part Number' },
      { name: 'uom', label: 'Unit of Measure (UOM)' },
      { name: 'partDescription', label: 'Part Description' },
      { name: 'mpnCode', label: 'MPN Code' },
      { name: 'gstin', label: 'GSTIN' },
    ]);

    if (stringTypeError) {
      return res.status(400).json({ success: false, error: stringTypeError });
    }

    const { status = 'Active', isDirectFromManufacturer, vendorId } = req.body;
    let { manufacturerName, manufacturerPartNumber } = req.body;

    manufacturerName = normalizeManufacturer(manufacturerName);
    if (typeof manufacturerPartNumber === 'string') {
      manufacturerPartNumber = manufacturerPartNumber.trim();
    }

    req.body.manufacturerName = manufacturerName;
    req.body.manufacturerPartNumber = manufacturerPartNumber;

    // Check linked Vendor's GSTIN: if vendor already has GSTIN, do not duplicate on MPN
    if (vendorId) {
      const Vendor = require('../models/Vendor');
      const vendorDoc = await Vendor.findById(vendorId);
      if (vendorDoc && vendorDoc.gstin && vendorDoc.gstin.trim()) {
        req.body.gstin = '';
      }
    }

    // Status drives validation strictness: Draft bypasses required checks
    if (status !== 'Draft') {
      if (!req.body.mpnName || !req.body.mpnName.trim()) {
        return res.status(400).json({ success: false, error: 'MPN Name is required' });
      }
      if (!manufacturerPartNumber) {
        return res.status(400).json({ success: false, error: 'Manufacturer Part Number is required' });
      }
      if (!manufacturerName) {
        return res.status(400).json({ success: false, error: 'Manufacturer Name is required' });
      }
      if (!req.body.materialId) {
        return res.status(400).json({ success: false, error: 'Please link a Material' });
      }
      if (!vendorId) {
        return res.status(400).json({ success: false, error: 'Please link a Vendor' });
      }
      if (req.body.unitPrice === undefined || req.body.unitPrice === null || req.body.unitPrice < 0) {
        return res.status(400).json({ success: false, error: 'Unit Price must be a valid number >= 0' });
      }
      if (!req.body.moq || req.body.moq < 1) {
        return res.status(400).json({ success: false, error: 'MOQ must be at least 1' });
      }
      if (!req.body.uom || !req.body.uom.trim()) {
        return res.status(400).json({ success: false, error: 'Unit of Measure (UOM) is required' });
      }

      // Duplicate check for SAME vendor
      const existing = await MPN.findOne({
        status: { $ne: 'Deleted' },
        vendorId,
        manufacturerName: { $regex: new RegExp(`^${manufacturerName}$`, 'i') },
        manufacturerPartNumber: { $regex: new RegExp(`^${manufacturerPartNumber}$`, 'i') },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: `A part with Manufacturer '${manufacturerName}' and Part Number '${manufacturerPartNumber}' is already registered for this Vendor.`,
        });
      }
    }

    // Auto-generate code if missing
    if (!req.body.mpnCode) {
      const activeMPNs = await MPN.find(
        { mpnCode: /^MPN\d{4}$/i },
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
      const seqNum = seqDoc && seqDoc.seq < 10000 ? seqDoc.seq : 1000;
      req.body.mpnCode = `MPN${Math.max(maxNum, seqNum) + 1}`;
    }

    const mpn = await MPN.create(req.body);

    const match = mpn.mpnCode.match(/^MPN(\d{4})$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= 1000 && num < 10000) {
        await Sequence.updateMany(
          { $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] },
          { $set: { seq: num } }
        );
      }
    }

    const populated = await mpn.populate([
      { path: 'materialId', select: 'name code unit' },
      { path: 'vendorId', select: 'name company vendorId gstin' },
    ]);

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Update MPN
// @route   PUT /api/mpns/:id
exports.updateMPN = async (req, res, next) => {
  try {
    const stringTypeError = validateStringFields(req.body, [
      { name: 'manufacturerName', label: 'Manufacturer Name' },
      { name: 'mpnName', label: 'MPN Name' },
      { name: 'manufacturerPartNumber', label: 'Manufacturer Part Number' },
      { name: 'uom', label: 'Unit of Measure (UOM)' },
      { name: 'partDescription', label: 'Part Description' },
      { name: 'mpnCode', label: 'MPN Code' },
      { name: 'gstin', label: 'GSTIN' },
    ]);

    if (stringTypeError) {
      return res.status(400).json({ success: false, error: stringTypeError });
    }

    let mpn = await MPN.findById(req.params.id);
    if (!mpn || mpn.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'MPN record not found' });
    }

    const status = req.body.status || mpn.status;
    let manufacturerName = req.body.manufacturerName
      ? normalizeManufacturer(req.body.manufacturerName)
      : mpn.manufacturerName;
    let manufacturerPartNumber = req.body.manufacturerPartNumber
      ? req.body.manufacturerPartNumber.trim()
      : mpn.manufacturerPartNumber;

    req.body.manufacturerName = manufacturerName;
    req.body.manufacturerPartNumber = manufacturerPartNumber;

    const vendorId = req.body.vendorId || mpn.vendorId;

    // Check linked Vendor's GSTIN: if vendor already has GSTIN, do not duplicate on MPN
    if (vendorId) {
      const Vendor = require('../models/Vendor');
      const vendorDoc = await Vendor.findById(vendorId);
      if (vendorDoc && vendorDoc.gstin && vendorDoc.gstin.trim()) {
        req.body.gstin = '';
      }
    }

    if (status !== 'Draft') {
      const existing = await MPN.findOne({
        _id: { $ne: req.params.id },
        status: { $ne: 'Deleted' },
        vendorId,
        manufacturerName: { $regex: new RegExp(`^${manufacturerName}$`, 'i') },
        manufacturerPartNumber: { $regex: new RegExp(`^${manufacturerPartNumber}$`, 'i') },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          error: `A part with Manufacturer '${manufacturerName}' and Part Number '${manufacturerPartNumber}' is already registered for this Vendor.`,
        });
      }
    }

    mpn = await MPN.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin');

    res.status(200).json({ success: true, data: mpn });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft Delete MPN (saves previousStatus)
// @route   DELETE /api/mpns/:id
exports.deleteMPN = async (req, res, next) => {
  try {
    const mpn = await MPN.findById(req.params.id);
    if (!mpn) {
      return res.status(404).json({ success: false, error: 'MPN record not found' });
    }

    mpn.previousStatus = mpn.status !== 'Deleted' ? mpn.status : 'Active';
    mpn.status = 'Deleted';
    await mpn.save();

    res.status(200).json({ success: true, message: 'MPN record moved to deleted history' });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore soft-deleted MPN to prior status
// @route   PUT /api/mpns/:id/restore
exports.restoreMPN = async (req, res, next) => {
  try {
    const mpn = await MPN.findById(req.params.id);
    if (!mpn) {
      return res.status(404).json({ success: false, error: 'MPN record not found' });
    }

    mpn.status = mpn.previousStatus || 'Active';
    await mpn.save();

    const populated = await mpn.populate([
      { path: 'materialId', select: 'name code unit' },
      { path: 'vendorId', select: 'name company vendorId' },
    ]);

    res.status(200).json({ success: true, message: 'MPN record restored successfully', data: populated });
  } catch (err) {
    next(err);
  }
};

// @desc    Batch soft-delete MPNs
// @route   POST /api/mpns/batch-delete
exports.batchDeleteMPNs = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of MPN IDs' });
    }

    const items = await MPN.find({ _id: { $in: ids } });
    for (let item of items) {
      item.previousStatus = item.status !== 'Deleted' ? item.status : 'Active';
      item.status = 'Deleted';
      await item.save();
    }

    res.status(200).json({ success: true, message: `Soft-deleted ${items.length} MPN record(s)` });
  } catch (err) {
    next(err);
  }
};

// @desc    Export MPNs to Excel (applies all 4 active grid filters: search, status, materialId, vendorId)
// @route   GET /api/mpns/export
exports.exportMPNsExcel = async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = buildMpnQuery(req.query);

    let mpns = await MPN.find(filter)
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId')
      .sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      mpns = mpns.filter((r) => {
        const matName = r.materialId?.name || '';
        const matCode = r.materialId?.code || '';
        const venName = r.vendorId?.name || '';
        const venComp = r.vendorId?.company || '';
        const haystack = [
          r.mpnCode,
          r.manufacturerPartNumber,
          r.mpnName,
          r.manufacturerName,
          matName,
          matCode,
          venName,
          venComp,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(term);
      });
    }

    const exportRows = mpns.map((m) => ({
      'MPN ID': m.mpnCode || '—',
      'MPN Name': m.mpnName || '—',
      'Manufacturer': m.manufacturerName || '—',
      'Manufacturer Part Number': m.manufacturerPartNumber || '—',
      'Material Name': m.materialId ? `${m.materialId.name} (${m.materialId.code || '—'})` : '—',
      'Vendor Name': m.vendorId ? `${m.vendorId.name} ${m.vendorId.company ? `(${m.vendorId.company})` : ''}` : '—',
      'Unit Price': m.unitPrice !== undefined ? m.unitPrice : '—',
      'MOQ': m.moq !== undefined ? m.moq : '—',
      'UOM': m.uom || '—',
      'GSTIN': m.vendorId?.gstin || m.gstin || '—',
      'Direct Sourcing': m.isDirectFromManufacturer ? 'Same as Vendor' : 'Independent',
      'Status': m.status || 'Active',
      'Description': m.partDescription || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MPN Master Grid');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MPN_Master_Export_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// @desc    Generate & stream PDF specification sheet for single MPN
// @route   GET /api/mpns/:id/pdf
exports.generateMPNPdf = async (req, res, next) => {
  try {
    const mpn = await MPN.findById(req.params.id)
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId');

    if (!mpn) {
      return res.status(404).json({ success: false, error: 'MPN record not found' });
    }

    generateSingleMpnPDF(res, mpn);
  } catch (err) {
    next(err);
  }
};
