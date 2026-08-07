const Vendor = require('../models/Vendor');
const Sequence = require('../models/Sequence');
const { writeAuditLog } = require('./auditService');
const mongoose = require('mongoose');

class VendorService {
  /**
   * Creates a new vendor with sequence generation and audit logging.
   * Business logic extracted from vendorController.createVendor.
   */
  static async createVendor(vendorData, user, session) {
    const { 
      name, company, email, phone, address, address2, zipCode, city, state, country,
      gstin, gstList, hasNoGst,
      primaryContactName, primaryContactPhone, primaryContactDesignation, notes, 
      contacts, category, subCategory, 
      ffsc2200, ffsc2200Expiry, ffsc2200Qty,
      fssai, fssaiExpiry, fssaiQty,
      bankAccountHolder, bankAccountNumber, bankName, ifscCode,
      status, secondaryAddresses 
    } = vendorData;

    let vendorId = vendorData.vendorId;

    if (!name || !email) {
      throw new Error('Please provide name and email');
    }

    const existing = await Vendor.findOne({ email }).session(session);
    if (existing) {
      throw new Error('Vendor with this email address already exists');
    }

    // Ensure vendorId uniqueness and auto-increment if the provided one is taken
    if (vendorId) {
      const existingVendorId = await Vendor.findOne({ vendorId: vendorId.toUpperCase() }).session(session);
      if (existingVendorId) {
        if (/^V\d+$/i.test(vendorId.toUpperCase())) {
          const allVendors = await Vendor.find({ vendorId: /^V\d+$/i }, { vendorId: 1 }).session(session);
          let maxNum = 1000;
          allVendors.forEach(v => {
            const num = parseInt((v.vendorId || '').substring(1), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          });
          vendorId = `V${maxNum + 1}`;
        } else {
          throw new Error(`Vendor with code '${vendorId}' already exists`);
        }
      }
    }

    if (!vendorId) {
      const allVendors = await Vendor.find({ vendorId: /^V\d+$/i }, { vendorId: 1 }).session(session);
      let maxNum = 1000;
      allVendors.forEach(v => {
        const num = parseInt((v.vendorId || '').substring(1), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      vendorId = `V${maxNum + 1}`;
      await Sequence.findByIdAndUpdate('vendorCode', { $set: { seq: maxNum + 1 } }, { upsert: true, session });
    }

    const vendor = new Vendor({
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
      secondaryAddresses: secondaryAddresses || [],
    });
    
    await vendor.save({ session });

    // Write audit log
    await writeAuditLog(session, 'Vendor', vendor._id, 'CREATE', null, vendor, user ? user.id : null);

    return vendor;
  }
}

module.exports = VendorService;
