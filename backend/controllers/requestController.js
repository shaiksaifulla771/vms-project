const PurchaseRequest = require('../models/PurchaseRequest');
const Vendor = require('../models/Vendor');

// @desc    Get all purchase requests
// @route   GET /api/requests
// @access  Private
exports.getRequests = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    const requests = await PurchaseRequest.find(query)
      .populate('vendorId', 'name company email')
      .populate('requestedBy', 'username email role')
      .populate('approvedBy', 'username email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single purchase request
// @route   GET /api/requests/:id
// @access  Private
exports.getRequest = async (req, res, next) => {
  try {
    const request = await PurchaseRequest.findById(req.params.id)
      .populate('vendorId', 'name company email')
      .populate('requestedBy', 'username email role')
      .populate('approvedBy', 'username email role');

    if (!request) {
      return res.status(404).json({ success: false, error: 'Purchase request not found' });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create purchase request
// @route   POST /api/requests
// @access  Private
exports.createRequest = async (req, res, next) => {
  try {
    const { title, vendorId, amount, description } = req.body;

    if (!title || !vendorId || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Please provide title, vendorId, and amount',
      });
    }

    // Verify vendor exists and is Active
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }
    if (vendor.status !== 'Active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot create purchase request for an Inactive vendor',
      });
    }

    const request = await PurchaseRequest.create({
      title,
      vendorId,
      amount,
      description: description || '',
      requestedBy: req.user._id,
      status: 'Pending',
    });

    const populated = await PurchaseRequest.findById(request._id)
      .populate('vendorId', 'name company email')
      .populate('requestedBy', 'username email role');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update purchase request (Only allowed when status is Pending)
// @route   PUT /api/requests/:id
// @access  Private
exports.updateRequest = async (req, res, next) => {
  try {
    const { title, vendorId, amount, description } = req.body;

    let request = await PurchaseRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Purchase request not found' });
    }

    // Check status. If not Pending, block modification.
    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot modify a purchase request that has already been ${request.status}`,
      });
    }

    // Verify vendor if changing
    if (vendorId && vendorId !== request.vendorId.toString()) {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return res.status(404).json({ success: false, error: 'Vendor not found' });
      }
      if (vendor.status !== 'Active') {
        return res.status(400).json({
          success: false,
          error: 'Cannot assign purchase request to an Inactive vendor',
        });
      }
    }

    request = await PurchaseRequest.findByIdAndUpdate(
      req.params.id,
      { title, vendorId, amount, description },
      { new: true, runValidators: true }
    )
      .populate('vendorId', 'name company email')
      .populate('requestedBy', 'username email role');

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Approve/Reject Purchase Request (State Machine Transition)
// @route   PATCH /api/requests/:id/approve
// @access  Private (Admin & Manager roles)
exports.approveOrRejectRequest = async (req, res, next) => {
  try {
    const { status } = req.body; // Approved or Rejected

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status transition. Status must be Approved or Rejected',
      });
    }

    const request = await PurchaseRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Purchase request not found' });
    }

    // Strict state transitions:
    // Approved -> Rejected : NOT ALLOWED
    // Rejected -> Approved : NOT ALLOWED
    // Any -> Pending : NOT ALLOWED
    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: `Invalid transition. Purchase request is already ${request.status} and cannot be changed.`,
      });
    }

    request.status = status;
    request.approvedBy = req.user._id;
    await request.save();

    const populated = await PurchaseRequest.findById(request._id)
      .populate('vendorId', 'name company email')
      .populate('requestedBy', 'username email role')
      .populate('approvedBy', 'username email role');

    res.status(200).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete purchase request
// @route   DELETE /api/requests/:id
// @access  Private
exports.deleteRequest = async (req, res, next) => {
  try {
    const request = await PurchaseRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Purchase request not found' });
    }

    // Only allow deletion of Pending requests
    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot delete purchase request that has already been ${request.status}`,
      });
    }

    await PurchaseRequest.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Purchase request deleted successfully',
      data: {},
    });
  } catch (err) {
    next(err);
  }
};
