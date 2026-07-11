const Vendor = require('../models/Vendor');
const Contract = require('../models/Contract');
const PurchaseRequest = require('../models/PurchaseRequest');

// @desc    Get all vendors with search, filter, pagination
// @route   GET /api/vendors
// @access  Private
exports.getVendors = async (req, res, next) => {
  try {
    const { search, category, status, page = 1, limit = 10 } = req.query;

    const query = {};

    // Apply filters
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }

    // Apply search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: vendors.length,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
      data: vendors,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single vendor
// @route   GET /api/vendors/:id
// @access  Private
exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a vendor
// @route   POST /api/vendors
// @access  Private
exports.createVendor = async (req, res, next) => {
  try {
    const { 
      name, 
      company, 
      email, 
      phone, 
      address, 
      address2, 
      state, 
      gstin, 
      gstList,
      hasNoGst,
      primaryContactName, 
      primaryContactPhone, 
      primaryContactDesignation, 
      notes, 
      category, 
      status 
    } = req.body;

    // Validate request
    if (!name || !company || !email || !phone || !address || !category) {
      return res.status(400).json({
        success: false,
        error: 'Please provide name, company, email, phone, address, and category',
      });
    }

    // Check if vendor email already exists
    const existing = await Vendor.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Vendor with this email address already exists',
      });
    }

    const vendor = await Vendor.create({
      name,
      company,
      email,
      phone,
      address,
      address2,
      state,
      gstin,
      gstList: gstList || [],
      hasNoGst: hasNoGst || false,
      primaryContactName,
      primaryContactPhone,
      primaryContactDesignation,
      notes,
      category,
      status: status || 'Active',
    });

    res.status(201).json({
      success: true,
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a vendor
// @route   PUT /api/vendors/:id
// @access  Private
exports.updateVendor = async (req, res, next) => {
  try {
    const { 
      name, 
      company, 
      email, 
      phone, 
      address, 
      address2, 
      state, 
      gstin, 
      gstList,
      hasNoGst,
      primaryContactName, 
      primaryContactPhone, 
      primaryContactDesignation, 
      notes, 
      category, 
      status 
    } = req.body;

    let vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Email update check
    if (email && email !== vendor.email) {
      const existing = await Vendor.findOne({ email });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Vendor with this email address already exists',
        });
      }
    }

    vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        company, 
        email, 
        phone, 
        address, 
        address2, 
        state, 
        gstin, 
        gstList: gstList || [],
        hasNoGst: hasNoGst || false,
        primaryContactName, 
        primaryContactPhone, 
        primaryContactDesignation, 
        notes, 
        category, 
        status 
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle Vendor Status (Active/Inactive)
// @route   PATCH /api/vendors/:id/status
// @access  Private
exports.toggleVendorStatus = async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    vendor.status = vendor.status === 'Active' ? 'Inactive' : 'Active';
    await vendor.save();

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a vendor (checks references to maintain integrity)
// @route   DELETE /api/vendors/:id
// @access  Private
exports.deleteVendor = async (req, res, next) => {
  try {
    const vendorId = req.params.id;

    // Check database references to ensure relational integrity
    const contracts = await Contract.findOne({ vendorId });
    if (contracts) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete vendor with active or pending contracts',
      });
    }

    const requests = await PurchaseRequest.findOne({ vendorId });
    if (requests) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete vendor with active purchase requests linked to them',
      });
    }

    const vendor = await Vendor.findByIdAndDelete(vendorId);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully',
      data: {},
    });
  } catch (err) {
    next(err);
  }
};
