const MPN = require('../models/MPN');
const Sequence = require('../models/Sequence');

// @desc    Get non-deleted MPNs (with Material + Vendor populated)
// @route   GET /api/mpns
exports.getMPNs = async (req, res, next) => {
  try {
    const mpns = await MPN.find({ status: { $ne: 'Deleted' } })
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId')
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
      .populate('vendorId', 'name company vendorId');

    if (!mpn || mpn.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'MPN not found' });
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
      { status: { $ne: 'Deleted' }, mpnCode: /^MPN\d{4}$/i },
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

    const seqDoc = await Sequence.findOne({ $or: [{ name: /mpnCode/i }, { _id: 'mpnCode' }] });
    const seqNum = seqDoc && seqDoc.seq < 10000 ? seqDoc.seq : 1000;
    const nextNum = Math.max(maxNum, seqNum) + 1;

    res.status(200).json({ success: true, nextCode: `MPN${nextNum}` });
  } catch (err) {
    next(err);
  }
};

// @desc    Create MPN & sync sequence if a manual code was typed
// @route   POST /api/mpns
exports.createMPN = async (req, res, next) => {
  try {
    // Auto-generate a code if the caller didn't supply one (mirrors peek logic)
    if (!req.body.mpnCode) {
      const activeMPNs = await MPN.find(
        { status: { $ne: 'Deleted' }, mpnCode: /^MPN\d{4}$/i },
        { mpnCode: 1 }
      );
      let maxNum = 1000;
      activeMPNs.forEach((m) => {
        const num = parseInt(m.mpnCode.substring(3), 10);
        if (!isNaN(num) && num < 10000 && num > maxNum) maxNum = num;
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
      { path: 'vendorId', select: 'name company vendorId' },
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
    let mpn = await MPN.findById(req.params.id);
    if (!mpn || mpn.status === 'Deleted') {
      return res.status(404).json({ success: false, error: 'MPN not found' });
    }

    mpn = await MPN.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('materialId', 'name code unit')
      .populate('vendorId', 'name company vendorId');

    res.status(200).json({ success: true, data: mpn });
  } catch (err) {
    next(err);
  }
};

// @desc    Soft Delete MPN
// @route   DELETE /api/mpns/:id
exports.deleteMPN = async (req, res, next) => {
  try {
    const mpn = await MPN.findById(req.params.id);
    if (!mpn) {
      return res.status(404).json({ success: false, error: 'MPN not found' });
    }
    mpn.status = 'Deleted';
    await mpn.save();
    res.status(200).json({ success: true, data: {} });
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
      return res.status(400).json({ success: false, error: 'Please provide an array of ids' });
    }

    await MPN.updateMany({ _id: { $in: ids } }, { $set: { status: 'Deleted' } });

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};
