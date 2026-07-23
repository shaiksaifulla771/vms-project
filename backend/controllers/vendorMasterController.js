const VendorMaster = require('../models/VendorMaster');
const Vendor = require('../models/Vendor');

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

    // Automatically migrate/seed from original Vendor collection if VendorMaster is empty
    const count = await VendorMaster.countDocuments();
    if (count === 0) {
      const oldVendors = await Vendor.find({});
      if (oldVendors.length > 0) {
        const migrated = oldVendors.map(v => {
          const firstContact = v.contacts?.[0] || {};
          return {
            Vendor_ID: v.vendorId || `VND-${v._id.toString().slice(-4).toUpperCase()}`,
            Company_Name: v.company || v.name,
            Tax_ID: v.gstin || `GSTIN-${v._id.toString().slice(-4).toUpperCase()}`,
            Contact_Email: v.email || 'info@company.com',
            Department: firstContact.department || 'Procurement',
            Role: firstContact.role || 'Buyer',
            Status: v.status || 'Active',
            contacts: v.contacts || [],
            is_deleted: false
          };
        });
        await VendorMaster.insertMany(migrated);
      }
    }

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
    const { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Department, Role, Status, contacts } = req.body;

    if (!Vendor_ID || !Company_Name || !Tax_ID || !Contact_Email) {
      return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    const cleanVendorId = Vendor_ID.trim();
    const cleanTaxId = Tax_ID.trim();

    // 1. Dual-Check Validation logic (Stop Upload Engine)
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
      Department: Department ? Department.trim() : '',
      Role: Role ? Role.trim() : '',
      Status: Status || 'Active',
      contacts: contacts || [],
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
    const { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Department, Role, Status, contacts } = req.body;

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
    if (Department !== undefined) record.Department = Department.trim();
    if (Role !== undefined) record.Role = Role.trim();
    if (Status) record.Status = Status;
    if (contacts) record.contacts = contacts;

    await record.save();
    res.status(200).json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
};

// @desc    Pre-validate batch rows before final ingestion
// @route   POST /api/vendor-masters/validate-batch
// @access  Private
exports.validateBatch = async (req, res, next) => {
  try {
    const { rows } = req.body; // Array of { Vendor_ID, Company_Name, Tax_ID, Contact_Email, Department, Role, Status }

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Provide rows array' });
    }

    // Load active and archived states to check duplicate intersections in memory
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

    const fileVendorIds = new Set();
    const fileTaxIds = new Set();

    const validatedRows = rows.map((row, index) => {
      const rowNum = index + 1;
      const vId = (row.Vendor_ID || '').toString().trim();
      const company = (row.Company_Name || '').toString().trim();
      const tId = (row.Tax_ID || '').toString().trim();
      const email = (row.Contact_Email || '').toString().trim();
      const dept = (row.Department || '').toString().trim();
      const role = (row.Role || '').toString().trim();
      const status = row.Status || 'Active';

      let error = null;
      let state = 'valid';

      if (!vId || !company || !tId || !email) {
        error = 'Error: Missing required fields (Vendor_ID, Company_Name, Tax_ID, and Contact_Email are all required).';
        state = 'invalid';
      } else {
        const vIdUpper = vId.toUpperCase();
        const tIdUpper = tId.toUpperCase();

        // Check internal file duplicate
        if (fileVendorIds.has(vIdUpper) || fileTaxIds.has(tIdUpper)) {
          error = `Error: Duplicate Vendor ID "${vId}" or Tax ID "${tId}" found within the uploaded file.`;
          state = 'invalid';
        }

        fileVendorIds.add(vIdUpper);
        fileTaxIds.add(tIdUpper);

        // Check active database
        if (state === 'valid' && (activeVendorIds.has(vIdUpper) || activeTaxIds.has(tIdUpper))) {
          error = 'Error: This data is already present in the main database.';
          state = 'active_duplicate';
        }

        // Check soft-deleted database
        if (state === 'valid' && (deletedVendorIds.has(vIdUpper) || deletedTaxIds.has(tIdUpper))) {
          error = 'Error: This data is present in deleted rows and sheets.';
          state = 'deleted_duplicate';
        }
      }

      return {
        row: rowNum,
        Vendor_ID: vId,
        Company_Name: company,
        Tax_ID: tId,
        Contact_Email: email,
        Department: dept,
        Role: role,
        Status: status,
        state,
        error
      };
    });

    res.status(200).json({ success: true, validatedRows });
  } catch (err) {
    next(err);
  }
};

// @desc    Bulk upload validation engine (Blocks batch if any duplicates found)
// @route   POST /api/vendor-masters/bulk
// @access  Private
exports.bulkUploadVendorMasters = async (req, res, next) => {
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No data rows provided.' });
    }

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
    const fileVendorIds = new Set();
    const fileTaxIds = new Set();

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      const vId = (row.Vendor_ID || '').toString().trim();
      const company = (row.Company_Name || '').toString().trim();
      const tId = (row.Tax_ID || '').toString().trim();
      const email = (row.Contact_Email || '').toString().trim();
      const dept = (row.Department || '').toString().trim();
      const role = (row.Role || '').toString().trim();
      const status = row.Status || 'Active';

      if (!vId || !company || !tId || !email) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId || 'N/A',
          Tax_ID: tId || 'N/A',
          error: 'Error: Missing required fields.'
        });
        return;
      }

      const vIdUpper = vId.toUpperCase();
      const tIdUpper = tId.toUpperCase();

      if (fileVendorIds.has(vIdUpper) || fileTaxIds.has(tIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: 'Error: Internal file duplicate.'
        });
      }

      fileVendorIds.add(vIdUpper);
      fileTaxIds.add(tIdUpper);

      if (activeVendorIds.has(vIdUpper) || activeTaxIds.has(tIdUpper)) {
        itemizedErrors.push({
          row: rowNum,
          Vendor_ID: vId,
          Tax_ID: tId,
          error: 'Error: This data is already present in the main database.'
        });
      }

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
        Department: dept,
        Role: role,
        Status: status,
        is_deleted: false
      });
    });

    if (itemizedErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Batch validation failed. Upload blocked.',
        itemizedErrors
      });
    }

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
