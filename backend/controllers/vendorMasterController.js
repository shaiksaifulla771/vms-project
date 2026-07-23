const VendorMaster = require('../models/VendorMaster');

// @desc    Check single duplicate for onBlur validation
// @route   POST /api/vendor-masters/check-duplicate
// @access  Private
exports.checkDuplicate = async (req, res, next) => {
  try {
    const { Vendor_ID, Tax_ID, excludeId } = req.body;

    if (!Vendor_ID && !Tax_ID) {
      return res.status(400).json({ success: false, error: 'Provide Vendor_ID or Tax_ID' });
    }

    // Query active records first
    const activeQuery = { is_deleted: false };
    if (excludeId) activeQuery._id = { $ne: excludeId };

    const activeOr = [];
    if (Vendor_ID) activeOr.push({ Vendor_ID: Vendor_ID.trim() });
    if (Tax_ID) activeOr.push({ Tax_ID: Tax_ID.trim() });
    activeQuery.$or = activeOr;

    const activeRecord = await VendorMaster.findOne(activeQuery);
    if (activeRecord) {
      return res.status(200).json({
        success: true,
        exists: true,
        state: 'active',
        message: 'Error: This data is already present in the main database.'
      });
    }

    // Query deleted records
    const deletedQuery = { is_deleted: true };
    if (excludeId) deletedQuery._id = { $ne: excludeId };
    deletedQuery.$or = activeOr;

    const deletedRecord = await VendorMaster.findOne(deletedQuery);
    if (deletedRecord) {
      return res.status(200).json({
        success: true,
        exists: true,
        state: 'deleted',
        message: 'Error: This data is present in deleted rows and sheets.'
      });
    }

    return res.status(200).json({ success: true, exists: false });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all vendor master records (active or archived)
// @route   GET /api/vendor-masters
// @access  Private
exports.getVendorMasters = async (req, res, next) => {
  try {
    const { view } = req.query; // 'active' or 'archived'
    const query = { is_deleted: view === 'archived' };

    const records = await VendorMaster.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: records.length, data: records });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a new vendor master record
// @route   POST /api/vendor-masters
// @access  Private
exports.createVendorMaster = async (req, res, next) => {
  try {
    const { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Status } = req.body;

    if (!Vendor_ID || !Company_Name || !Tax_ID || !Contact_Email) {
      return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    const cleanVendorId = Vendor_ID.trim();
    const cleanTaxId = Tax_ID.trim();

    // 1. Dual-Check Validation logic (Stop Upload Engine)
    // Check active
    const activeConflict = await VendorMaster.findOne({
      is_deleted: false,
      $or: [{ Vendor_ID: cleanVendorId }, { Tax_ID: cleanTaxId }]
    });
    if (activeConflict) {
      return res.status(400).json({
        success: false,
        error: 'Error: This data is already present in the main database.'
      });
    }

    // Check soft-deleted
    const deletedConflict = await VendorMaster.findOne({
      is_deleted: true,
      $or: [{ Vendor_ID: cleanVendorId }, { Tax_ID: cleanTaxId }]
    });
    if (deletedConflict) {
      return res.status(400).json({
        success: false,
        error: 'Error: This data is present in deleted rows and sheets.'
      });
    }

    // Insert
    const record = await VendorMaster.create({
      Vendor_ID: cleanVendorId,
      Company_Name: Company_Name.trim(),
      Tax_ID: cleanTaxId,
      Contact_Email: Contact_Email.trim(),
      Status: Status || 'Active',
      is_deleted: false
    });

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a vendor master record
// @route   PUT /api/vendor-masters/:id
// @access  Private
exports.updateVendorMaster = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Status } = req.body;

    const record = await VendorMaster.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const cleanVendorId = Vendor_ID ? Vendor_ID.trim() : record.Vendor_ID;
    const cleanTaxId = Tax_ID ? Tax_ID.trim() : record.Tax_ID;

    // Check active conflict excluding current ID
    const activeConflict = await VendorMaster.findOne({
      _id: { $ne: id },
      is_deleted: false,
      $or: [{ Vendor_ID: cleanVendorId }, { Tax_ID: cleanTaxId }]
    });
    if (activeConflict) {
      return res.status(400).json({
        success: false,
        error: 'Error: This data is already present in the main database.'
      });
    }

    // Check deleted conflict excluding current ID
    const deletedConflict = await VendorMaster.findOne({
      _id: { $ne: id },
      is_deleted: true,
      $or: [{ Vendor_ID: cleanVendorId }, { Tax_ID: cleanTaxId }]
    });
    if (deletedConflict) {
      return res.status(400).json({
        success: false,
        error: 'Error: This data is present in deleted rows and sheets.'
      });
    }

    record.Vendor_ID = cleanVendorId;
    if (Company_Name) record.Company_Name = Company_Name.trim();
    record.Tax_ID = cleanTaxId;
    if (Contact_Email) record.Contact_Email = Contact_Email.trim();
    if (Status) record.Status = Status;

    await record.save();
    res.status(200).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk upload validation engine (Blocks batch if any duplicates found)
// @route   POST /api/vendor-masters/bulk
// @access  Private
exports.bulkUploadVendorMasters = async (req, res, next) => {
  try {
    const { rows } = req.body; // Array of { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Status }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No data rows provided.' });
    }

    // Load all active and soft-deleted records for quick in-memory cross-checks
    const allRecords = await VendorMaster.find({});
    const activeVendorIds = new Set();
    const activeTaxIds = new Set();
    const deletedVendorIds = new Set();
    const deletedTaxIds = new Set();

    allRecords.forEach(rec => {
      const vId = rec.Vendor_ID.toUpperCase().trim();
      const tId = rec.Tax_ID.toUpperCase().trim();
      if (rec.is_deleted) {
        deletedVendorIds.add(vId);
        deletedTaxIds.add(tId);
      } else {
        activeVendorIds.add(vId);
        activeTaxIds.add(tId);
      }
    });

    const itemizedErrors = [];
    const parsedRows = [];

    // Track internal file duplicates to ensure the file itself doesn't contain duplicates
    const fileVendorIds = new Set();
    const fileTaxIds = new Set();

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      const vId = (row.Vendor_ID || '').toString().trim();
      const company = (row.Company_Name || '').toString().trim();
      const tId = (row.Tax_ID || '').toString().trim();
      const email = (row.Contact_Email || '').toString().trim();
      const status = row.Status || 'Active';

      // 1. Field validation
      if (!vId || !company || !tId || !email) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId || 'N/A',
          Tax_ID: tId || 'N/A',
          error: 'Error: Missing required fields (Vendor_ID, Company_Name, Tax_ID, and Contact_Email are all required).'
        });
        return;
      }

      const vIdUpper = vId.toUpperCase();
      const tIdUpper = tId.toUpperCase();

      // 2. Check internal file duplicates
      if (fileVendorIds.has(vIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: `Error: Duplicate Vendor ID "${vId}" found within the uploaded file.`
        });
      }
      if (fileTaxIds.has(tIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: `Error: Duplicate Tax ID "${tId}" found within the uploaded file.`
        });
      }

      fileVendorIds.add(vIdUpper);
      fileTaxIds.add(tIdUpper);

      // 3. Database intersection checks
      // Check active
      if (activeVendorIds.has(vIdUpper) || activeTaxIds.has(tIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: 'Error: This data is already present in the main database.'
        });
      }

      // Check deleted
      if (deletedVendorIds.has(vIdUpper) || deletedTaxIds.has(tIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: 'Error: This data is present in deleted rows and sheets.'
        });
      }

      parsedRows.push({
        Vendor_ID: vId,
        Company_Name: company,
        Tax_ID: tId,
        Contact_Email: email,
        Status: status,
        is_deleted: false
      });
    });

    // If there is ANY error, block the entire batch upload
    if (itemizedErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Batch validation failed. Upload blocked.',
        itemizedErrors
      });
    }

    // Insert entire batch
    const records = await VendorMaster.insertMany(parsedRows);
    res.status(201).json({ success: true, count: records.length, message: 'Batch uploaded successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Archive (soft delete) a vendor master record
// @route   DELETE /api/vendor-masters/:id
// @access  Private
exports.softDeleteVendorMaster = async (req, res, next) => {
  try {
    const { id } = req.params;

    const record = await VendorMaster.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    record.is_deleted = true;
    await record.save();

    res.status(200).json({ success: true, message: 'Vendor soft-deleted/archived successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Restore a soft-deleted vendor master record
// @route   PATCH /api/vendor-masters/:id/restore
// @access  Private
exports.restoreVendorMaster = async (req, res, next) => {
  try {
    const { id } = req.params;

    const record = await VendorMaster.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    record.is_deleted = false;
    await record.save();

    res.status(200).json({ success: true, message: 'Vendor record restored to main database successfully' });
  } catch (err) {
    next(err);
  }
};
