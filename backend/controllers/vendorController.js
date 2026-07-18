const Vendor = require('../models/Vendor');
const Sequence = require('../models/Sequence');

const { syncExcelToMongoDB } = require('../utils/syncUtility');
const XLSX = require('xlsx');


exports.getVendors = async (req, res, next) => {
  try {
    const { category, search, status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { vendorId: { $regex: search, $options: 'i' } }
      ];
    }
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query).sort({ createdAt: -1 }).skip(startIndex).limit(limitNum);
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
  try {
    const { 
      name, company, email, phone, address, address2, zipCode, city, state, country,
      gstin, gstList, hasNoGst,
      primaryContactName, primaryContactPhone, primaryContactDesignation, notes, 
      contacts,
      category, subCategory, 
      ffsc2200, ffsc2200Expiry, ffsc2200Qty,
      fssai, fssaiExpiry, fssaiQty,
      bankAccountHolder, bankAccountNumber, bankName, ifscCode,
      status 
    } = req.body;

    let vendorId = req.body.vendorId;

    if (!name || !email) return res.status(400).json({ success: false, error: 'Please provide name and email' });
    const existing = await Vendor.findOne({ email });
    if (existing) return res.status(400).json({ success: false, error: 'Vendor with this email address already exists' });

    if (!vendorId) {
      const seqDoc = await Sequence.findById('vendorCode');
      let nextCode = 1001;
      if (seqDoc) nextCode = seqDoc.seq + 1;
      await Sequence.findByIdAndUpdate('vendorCode', { $set: { seq: nextCode } }, { upsert: true });
      vendorId = `V${nextCode}`;
    } else {
      const match = vendorId.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num)) {
          const seqDoc = await Sequence.findById('vendorCode');
          if (!seqDoc || num > seqDoc.seq) {
            await Sequence.findByIdAndUpdate('vendorCode', { $set: { seq: num } }, { upsert: true });
          }
        }
      }
    }

    const vendor = await Vendor.create({
      vendorId, name, company: company || name, email, phone: phone || '', 
      address: address || '', address2, zipCode, city, state, country,
      gstin, gstList: gstList || [], hasNoGst: hasNoGst || false,
      primaryContactName, primaryContactPhone, primaryContactDesignation, notes,
      contacts: contacts || [],
      category: category || 'Other', subCategory, 
      ffsc2200, ffsc2200Expiry, ffsc2200Qty,
      fssai, fssaiExpiry, fssaiQty,
      bankAccountHolder, bankAccountNumber, bankName, ifscCode,
      status: status || 'Active',
    });
    res.status(201).json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
};

exports.updateVendor = async (req, res, next) => {
  try {
    let vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    
    const { email } = req.body;
    if (email && email !== vendor.email) {
      const existing = await Vendor.findOne({ email });
      if (existing) return res.status(400).json({ success: false, error: 'Vendor with this email address already exists' });
    }
    
    vendor = await Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    await vendor.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

exports.peekNextVendorCode = async (req, res, next) => {
  try {
    const seqDoc = await Sequence.findById('vendorCode');
    const nextCode = seqDoc ? seqDoc.seq + 1 : 1001;
    res.status(200).json({ success: true, nextCode: `V${nextCode}` });
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

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Uploaded sheet file is empty' });
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

    const result = await Vendor.deleteMany({ importSource: source });

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} vendors imported from ${source}.`
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

    const result = await Vendor.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} vendor(s).`
    });
  } catch (err) {
    next(err);
  }
};
