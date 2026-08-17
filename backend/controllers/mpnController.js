const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');
const XLSX = require('xlsx');
const { generateSingleMpnPDF } = require('../utils/pdfGenerator');
const MPNService = require('../services/mpnService');
const MPNBulkService = require('../services/mpnBulkService');

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

const cacheService = require('../services/cacheService');

// @desc    Get non-deleted MPNs (accepts 4 filters: search, status, materialId, vendorId, page, limit)
// @route   GET /api/mpns
exports.getMPNs = async (req, res, next) => {
  try {
    const { search, materialId, vendorId, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = parseInt(req.query.limit, 10) || 0;
    const filter = buildMpnQuery(req.query);

    const cacheKey = `mpns:list:${materialId || 'all'}:${vendorId || 'all'}:${status || 'all'}:${search || 'none'}:${page}:${limit}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    let mpns = await MPN.find(filter)
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin')
      .sort({ createdAt: -1 })
      .lean();

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

    const total = mpns.length;
    let paginatedData = mpns;
    if (limit > 0) {
      paginatedData = mpns.slice((page - 1) * limit, page * limit);
    }

    const responsePayload = {
      success: true,
      count: paginatedData.length,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      pagination: { total, page: limit > 0 ? page : 1, pages: limit > 0 ? Math.ceil(total / limit) : 1, limit: limit > 0 ? limit : total },
      data: paginatedData,
      items: paginatedData
    };

    await cacheService.set(cacheKey, responsePayload, 300);
    res.status(200).json(responsePayload);
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
    const activeMPNs = await MPN.find(
      { mpnCode: /^MPN\d{4}$/i, status: { $ne: 'Deleted' } },
      { mpnCode: 1 }
    );

    let maxNum = 1000;
    activeMPNs.forEach((m) => {
      if (m.mpnCode) {
        const num = parseInt(m.mpnCode.substring(3), 10);
        if (!isNaN(num) && num < 10000 && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const Sequence = require('../models/Sequence');
    const seqDoc = await Sequence.findOne({ $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] });
    const seqNum = (seqDoc && typeof seqDoc.seq === 'number') ? seqDoc.seq : 1000;
    const finalMax = Math.max(maxNum, seqNum);

    res.status(200).json({ success: true, nextCode: `MPN${finalMax + 1}` });
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
// @route   POST /api/mpns
const MPNPriceHistory = require('../models/MPNPriceHistory');

exports.createMPN = async (req, res, next) => {
  try {
    const mpn = await MPNService.createMPN(req.body);
    
    const populated = await mpn.populate([
      { path: 'materialId', select: 'name code unit' },
      { path: 'vendorId', select: 'name company vendorId gstin' },
    ]);

    await cacheService.invalidatePattern('mpns:*');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    if (err.message && (err.message.includes('Validation Error') || err.message.includes('Duplicate Error'))) {
      return res.status(400).json({ success: false, error: err.message.replace(/^(Validation Error:|Duplicate Error:)\s*/, '') });
    }
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

      { name: 'partDescription', label: 'Part Description' },
      { name: 'mpnCode', label: 'MPN Code' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'uom', label: 'UOM' },
      { name: 'priceUOM', label: 'Price UOM' },
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
    let manufacturerPartNumber = (req.body.manufacturerPartNumber && req.body.manufacturerPartNumber.trim())
      ? req.body.manufacturerPartNumber.trim()
      : (mpn.manufacturerPartNumber || req.body.mpnCode || mpn.mpnCode || 'MPN-AUTO');

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

    if (req.body.price !== undefined && Number(req.body.price) !== mpn.price) {
      req.body.priceUpdatedAt = Date.now();
      const newPrice = Number(req.body.price);
      await MPNPriceHistory.create({
        mpnId: mpn._id,
        previousPrice: mpn.price,
        newPrice: newPrice,
        effectiveDate: new Date(),
        modifiedBy: req.user ? req.user.name : 'System'
      });
    }

    mpn = await MPN.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId gstin');

    await cacheService.invalidatePattern('mpns:*');
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

    await cacheService.invalidatePattern('mpns:*');
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

    await cacheService.invalidatePattern('mpns:*');
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

    await cacheService.invalidatePattern('mpns:*');
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
      'MOQ': m.moq !== undefined ? m.moq : '—',
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

// @desc    Bulk create MPNs with atomic sequence block reservation & per-row error isolation
// @route   POST /api/mpns/bulk
exports.bulkCreateMPNs = async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : Array.isArray(req.body) ? req.body : [];

    const result = await MPNBulkService.bulkCreate(rows, req.user);

    res.status(200).json({
      success: true,
      count: result.successCount,
      total: result.totalCount,
      results: result.results,
    });
  } catch (err) {
    if (err.message && err.message.includes('Validation Error')) {
      return res.status(400).json({ success: false, error: err.message.replace(/^Validation Error:\s*/, '') });
    }
    next(err);
  }
};

