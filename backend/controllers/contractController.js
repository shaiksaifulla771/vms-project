const Contract = require('../models/Contract');
const Vendor = require('../models/Vendor');

// Helper to determine status based on dates
const getAutoStatus = (startDate, endDate, currentStatus) => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) {
    return 'Pending';
  } else if (now > end) {
    return 'Expired';
  } else {
    // If the contract is within the active date range, set it to Active
    return 'Active';
  }
};

// @desc    Get all contracts
// @route   GET /api/contracts
// @access  Private
exports.getContracts = async (req, res, next) => {
  try {
    const { status, vendorId } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }
    if (vendorId) {
      query.vendorId = vendorId;
    }

    // Retrieve and check statuses to update dynamically
    const contracts = await Contract.find(query)
      .populate('vendorId', 'name company email')
      .sort({ createdAt: -1 });

    // Update statuses dynamically on retrieve if dates changed
    let updated = false;
    for (let contract of contracts) {
      const computedStatus = getAutoStatus(contract.startDate, contract.endDate, contract.status);
      if (contract.status !== computedStatus) {
        contract.status = computedStatus;
        await contract.save();
        updated = true;
      }
    }

    // Re-fetch if updates occurred to have fresh data
    const finalContracts = updated 
      ? await Contract.find(query).populate('vendorId', 'name company email').sort({ createdAt: -1 })
      : contracts;

    res.status(200).json({
      success: true,
      count: finalContracts.length,
      data: finalContracts,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single contract
// @route   GET /api/contracts/:id
// @access  Private
exports.getContract = async (req, res, next) => {
  try {
    const contract = await Contract.findById(req.params.id).populate('vendorId', 'name company email');

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    // Auto-update status if needed
    const computedStatus = getAutoStatus(contract.startDate, contract.endDate, contract.status);
    if (contract.status !== computedStatus) {
      contract.status = computedStatus;
      await contract.save();
    }

    res.status(200).json({
      success: true,
      data: contract,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create contract
// @route   POST /api/contracts
// @access  Private
exports.createContract = async (req, res, next) => {
  try {
    const { title, vendorId, startDate, endDate, value, documentUrl } = req.body;

    if (!title || !vendorId || !startDate || !endDate || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Please provide title, vendorId, startDate, endDate, and contract value',
      });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Linked vendor not found' });
    }

    // Date validation
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: 'Contract End Date must be after the Start Date',
      });
    }

    // Determine status
    const status = getAutoStatus(startDate, endDate);

    const contract = await Contract.create({
      title,
      vendorId,
      startDate,
      endDate,
      value,
      status,
      documentUrl: documentUrl || '',
    });

    const populatedContract = await Contract.findById(contract._id).populate('vendorId', 'name company email');

    res.status(201).json({
      success: true,
      data: populatedContract,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update contract
// @route   PUT /api/contracts/:id
// @access  Private
exports.updateContract = async (req, res, next) => {
  try {
    const { title, vendorId, startDate, endDate, value, documentUrl, status } = req.body;

    let contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    // Verify vendor if changing
    if (vendorId && vendorId !== contract.vendorId.toString()) {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Linked vendor not found' });
      }
    }

    // Date validation
    const start = new Date(startDate || contract.startDate);
    const end = new Date(endDate || contract.endDate);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: 'Contract End Date must be after the Start Date',
      });
    }

    // Automatically determine status or override if provided (dates rule status first)
    const computedStatus = getAutoStatus(start, end);

    contract = await Contract.findByIdAndUpdate(
      req.params.id,
      {
        title,
        vendorId,
        startDate: start,
        endDate: end,
        value,
        status: status || computedStatus,
        documentUrl: documentUrl === undefined ? contract.documentUrl : documentUrl,
      },
      { new: true, runValidators: true }
    ).populate('vendorId', 'name company email');

    res.status(200).json({
      success: true,
      data: contract,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete contract
// @route   DELETE /api/contracts/:id
// @access  Private
exports.deleteContract = async (req, res, next) => {
  try {
    const contract = await Contract.findByIdAndDelete(req.params.id);

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Contract deleted successfully',
      data: {},
    });
  } catch (err) {
    next(err);
  }
};
