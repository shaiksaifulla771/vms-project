const Vendor = require('../models/Vendor');
const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');
const Sequence = require('../models/Sequence');
const { syncExcelToMongoDB } = require('../utils/dbSync');
const { escapeRegex } = require('../utils/security');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { writeAuditLog } = require('../services/auditService');
const VendorService = require('../services/vendorService');

exports.getVendors = async (req, res, next) => {
  try {
    const { category, search, status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) {
      query.status = status;
    } else {
      query.status = { $ne: 'Deleted' };
    }
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { company: { $regex: safeSearch, $options: 'i' } },
        { vendorId: { $regex: safeSearch, $options: 'i' } }
      ];
    }
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query).select('-bankAccountNumber -ifscCode').sort({ createdAt: -1 }).skip(startIndex).limit(limitNum);
    res.status(200).json({ success: true, count: vendors.length, pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum), limit: limitNum }, data: vendors });
  } catch (err) {
    next(err);
  }
};

exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.status(200).json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
};

exports.createVendor = async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const vendor = await VendorService.createVendor(req.body, req.user, session);
    await commitSafeTransaction(session);
    res.status(201).json({ success: true, data: vendor });
  } catch (err) {
    await abortSafeTransaction(session);
    if (err.message === 'Please provide name and email' || err.message.includes('already exists')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  } finally {
    session.endSession();
  }
};

exports.updateVendor = async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    let vendor = await Vendor.findById(req.params.id).session(session);
    if (!vendor) {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    
    const { email } = req.body;
    if (email && email !== vendor.email) {
      const existing = await Vendor.findOne({ email }).session(session);
      if (existing) {
        await abortSafeTransaction(session);
        return res.status(400).json({ success: false, error: 'Vendor with this email address already exists' });
      }
    }
    
    // Create a clone of the old document for diffing
    const oldDoc = vendor.toObject();

    // Apply updates manually to the document instance to save via session
    Object.assign(vendor, req.body);
    await vendor.save({ session });

    // Write audit log
    await writeAuditLog(session, 'Vendor', vendor._id, 'UPDATE', oldDoc, vendor, req.user ? req.user.id : null);

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, data: vendor });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

exports.deleteVendor = async (req, res, next) => {
  const session = await mongoose.startSession();
  startSafeTransaction(session);
  try {
    const vendor = await Vendor.findById(req.params.id).session(session);
    if (!vendor) {
      await abortSafeTransaction(session);
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    
    const oldDoc = vendor.toObject();
    vendor.status = 'Deleted';
    await vendor.save({ session });

    // Write audit log for soft delete
    await writeAuditLog(session, 'Vendor', vendor._id, 'DELETE', oldDoc, vendor, req.user ? req.user.id : null);

    await commitSafeTransaction(session);
    res.status(200).json({ success: true, message: 'Vendor moved to deleted history successfully', data: {} });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

exports.peekNextVendorCode = async (req, res, next) => {
  try {
    const allVendors = await Vendor.find({ status: { $ne: 'Deleted' } }, { vendorId: 1 });
    let maxNum = 1000;
    allVendors.forEach(v => {
      const match = (v.vendorId || '').match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const seqDoc = await Sequence.findById('vendorCode');
    const seqNum = seqDoc ? seqDoc.seq : 1000;
    
    const nextNum = Math.max(maxNum, seqNum) + 1;
    await Sequence.findByIdAndUpdate('vendorCode', { $set: { seq: nextNum - 1 } }, { upsert: true });

    res.status(200).json({ success: true, nextCode: `V${nextNum}` });
  } catch (err) {
    next(err);
  }
};


exports.createVendorsBatch = async (req, res, next) => {
  try {
    const { vendors, importSource } = req.body;
    if (!Array.isArray(vendors) || vendors.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of vendors' });
    }

    const errors = [];
    const validItems = [];
    const existingVendors = await Vendor.find({});
    
    // Quick validation
    for (let i = 0; i < vendors.length; i++) {
      const item = vendors[i];
      if (!item.name) {
        errors.push(`Row ${i + 1}: Name is required.`);
        continue;
      }
      validItems.push(item);
    }

    if (validItems.length === 0) {
      return res.status(200).json({
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      });
    }

    const syncResult = await syncExcelToMongoDB(Vendor, validItems, {
      matchFields: ['vendorId'],
      defaultFields: {
        importSource: importSource !== undefined ? importSource : 'Imported data from Excel'
      }
    });

    if (validItems.length > 0) {
      let maxNum = 0;
      for (const item of validItems) {
        if (item.vendorId) {
          const match = String(item.vendorId).match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
      
      if (maxNum > 0) {
        const seqDoc = await Sequence.findById('vendorCode');
        if (!seqDoc || maxNum > seqDoc.seq) {
          await Sequence.findByIdAndUpdate(
            'vendorCode',
            { $set: { seq: maxNum } },
            { upsert: true }
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    });
  } catch (err) {
    next(err);
  }
};

exports.createVendorsBatchUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a spreadsheet file' });
    }

    const { importSource, isAutoEntry } = req.body;
    const isAutoEntryVal = isAutoEntry === 'true' || isAutoEntry === true;

    let rows;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ success: false, error: 'Uploaded file contains no readable sheets.' });
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    } catch (parseErr) {
      return res.status(400).json({ success: false, error: 'Failed to parse uploaded spreadsheet file. File may be corrupted or invalid format.' });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet file is empty' });
    }

    const MAX_ROWS = process.env.MAX_UPLOAD_ROWS ? parseInt(process.env.MAX_UPLOAD_ROWS, 10) : 5000;
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ success: false, error: `Uploaded sheet contains ${rows.length} rows, which exceeds the maximum allowed limit of ${MAX_ROWS} rows per upload.` });
    }

    const getRowValueIgnoreCase = (row, keys) => {
      for (const rowKey in row) {
        const normalizedRowKey = rowKey.trim().toLowerCase().replace(/[\s_-]/g, '');
        for (const key of keys) {
          const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
          if (normalizedRowKey === normalizedKey) {
            return row[rowKey];
          }
        }
      }
      return null;
    };

    const vendorList = await Vendor.find({});
    const systemExistingCodes = vendorList.map(v => (v.vendorId || '').toUpperCase().trim());
    const importedCodesInBatch = new Set();

    let nextAutoCounter = (() => {
      const numericCodes = vendorList
        .map(v => {
          if(!v.vendorId) return null;
          const match = String(v.vendorId).match(/\d+/);
          return match ? parseInt(match[0], 10) : null;
        })
        .filter(num => num !== null && !isNaN(num) && num >= 1001 && num <= 9999);
      return numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 1001;
    })();

    const errors = [];
    const validItems = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (getRowValueIgnoreCase(row, ["vendorname", "name", "vendor_name", "vendor name"]) || '').toString().trim();
      let vendorId = (getRowValueIgnoreCase(row, ["vendorid", "vendor id", "vendor code", "vendor_code"]) || '').toString().trim();
      const company = (getRowValueIgnoreCase(row, ["company", "companyname", "company name"]) || name).toString().trim();
      const email = (getRowValueIgnoreCase(row, ["email", "emailaddress"]) || '').toString().trim();
      const phone = (getRowValueIgnoreCase(row, ["phone", "phonenumber", "mobile"]) || '').toString().trim();
      const category = (getRowValueIgnoreCase(row, ["category", "vendortype"]) || 'Other').toString().trim();
      const status = (getRowValueIgnoreCase(row, ["status", "state"]) || 'Active').toString().trim();
      const gstListRaw = getRowValueIgnoreCase(row, ["gst", "gstin", "gstregistration"]);

      if (!name) {
        errors.push(`Row ${i + 1}: Name is required.`);
        continue;
      }

      if (!vendorId || isAutoEntryVal) {
        const existingByName = vendorList.find(v => 
          v.name.trim().toLowerCase() === name.toLowerCase()
        );

        if (existingByName && existingByName.vendorId) {
          vendorId = existingByName.vendorId;
        } else {
          let generatedCode = `V${nextAutoCounter}`;
          nextAutoCounter++;
          while (systemExistingCodes.includes(generatedCode) || importedCodesInBatch.has(generatedCode)) {
            generatedCode = `V${nextAutoCounter}`;
            nextAutoCounter++;
          }
          vendorId = generatedCode;
        }
      }

      importedCodesInBatch.add(vendorId.toUpperCase());
      
      let gstList = [];
      if(gstListRaw) {
        gstList.push({ state: '', gstin: gstListRaw.toString().trim() });
      }

      validItems.push({
        name,
        vendorId,
        company,
        email,
        phone,
        category,
        status,
        gstList
      });
    }

    if (validItems.length === 0) {
      return res.status(200).json({
        success: true,
        insertedCount: 0,
        updatedCount: 0,
        errorsCount: errors.length,
        errors
      });
    }

    const syncResult = await syncExcelToMongoDB(Vendor, validItems, {
      matchFields: ['vendorId'],
      defaultFields: {
        importSource: importSource || req.file.originalname || 'Excel Stream Upload'
      }
    });

    res.status(200).json({
      success: true,
      insertedCount: syncResult.insertedCount,
      updatedCount: syncResult.updatedCount,
      errorsCount: errors.length + syncResult.errorsCount,
      errors: [...errors, ...syncResult.errors]
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteVendorsBySource = async (req, res, next) => {
  try {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ success: false, error: 'Source parameter is required' });
    }

    const vendorsToDelete = await Vendor.find({ importSource: source });
    if (vendorsToDelete.length === 0) {
      return res.status(404).json({ success: false, error: 'No vendors found for this source' });
    }

    const result = await Vendor.updateMany({ importSource: source }, { $set: { status: 'Deleted' } });

    res.status(200).json({
      success: true,
      message: `Successfully moved ${result.modifiedCount} vendors imported from ${source} to deleted history.`
    });
  } catch (err) {
    next(err);
  }
};

exports.batchDeleteVendors = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No vendor IDs provided' });
    }

    const result = await Vendor.updateMany({ _id: { $in: ids } }, { $set: { status: 'Deleted' } });

    res.status(200).json({
      success: true,
      message: `Successfully moved ${result.modifiedCount} vendor(s) to deleted history.`,
      count: result.modifiedCount
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Peek next available vendor code without incrementing
// @route   GET /api/vendors/sequence-peek
// @access  Private
exports.peekNextVendorCode = async (req, res, next) => {
  try {
    const activeVendors = await Vendor.find(
      { vendorId: /^V\d+$/i },
      { vendorId: 1 }
    );
    let maxNum = 1000;
    activeVendors.forEach((v) => {
      if (v.vendorId) {
        const match = v.vendorId.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num < 10000 && num > maxNum) maxNum = num;
        }
      }
    });

    const nextCode = `V${maxNum + 1}`;
    res.status(200).json({ success: true, nextCode });
  } catch (err) {
    next(err);
  }
};

// @desc    Get next available vendor code and increment sequence
// @route   GET /api/vendors/next-code
// @access  Private
exports.getNextVendorCode = async (req, res, next) => {
  try {
    const activeVendors = await Vendor.find(
      { vendorId: /^V\d+$/i },
      { vendorId: 1 }
    );
    let maxNum = 1000;
    activeVendors.forEach((v) => {
      if (v.vendorId) {
        const match = v.vendorId.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num < 10000 && num > maxNum) maxNum = num;
        }
      }
    });

    const Sequence = require('../models/Sequence');
    const seqDoc = await Sequence.findOne({ $or: [{ name: /vendorCode/i }, { _id: 'vendorCode' }] });
    const seqNum = seqDoc ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;

    await Sequence.updateMany(
      { $or: [{ name: /vendorCode/i }, { _id: 'vendorCode' }] },
      { $set: { seq: nextNum } }
    );
    res.status(200).json({ success: true, nextCode: `V${nextNum}` });
  } catch (err) {
    next(err);
  }
};
