const PerformanceRating = require('../models/PerformanceRating');
const Vendor = require('../models/Vendor');

// @desc    Add rating for a vendor
// @route   POST /api/performance
// @access  Private
exports.createRating = async (req, res, next) => {
  try {
    const { vendorId, rating, feedback } = req.body;

    if (!vendorId || rating === undefined || !feedback) {
      return res.status(400).json({
        success: false,
        error: 'Please provide vendorId, rating, and feedback comments',
      });
    }

    const val = parseInt(rating);
    if (isNaN(val) || val < 1 || val > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be an integer between 1 and 5',
      });
    }

    // Verify vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const performance = await PerformanceRating.create({
      vendorId,
      rating: val,
      feedback,
      ratedBy: req.user._id,
    });

    const populated = await PerformanceRating.findById(performance._id)
      .populate('vendorId', 'name company email')
      .populate('ratedBy', 'username email');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all ratings
// @route   GET /api/performance
// @access  Private
exports.getRatings = async (req, res, next) => {
  try {
    const { vendorId } = req.query;
    const query = {};

    if (vendorId) {
      query.vendorId = vendorId;
    }

    const ratings = await PerformanceRating.find(query)
      .populate('vendorId', 'name company email')
      .populate('ratedBy', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: ratings.length,
      data: ratings,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get analytics for all vendors (Average rating, count)
// @route   GET /api/performance/analytics
// @access  Private
exports.getPerformanceAnalytics = async (req, res, next) => {
  try {
    // We aggregate the average rating and count of evaluations per vendor
    const analytics = await PerformanceRating.aggregate([
      {
        $group: {
          _id: '$vendorId',
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Populate vendor details manually or with lookup
    const populatedAnalytics = await Promise.all(
      analytics.map(async (item) => {
        const vendor = await Vendor.findById(item._id).select('name company category status');
        return {
          vendorId: item._id,
          vendorName: vendor ? vendor.name : 'Unknown Vendor',
          company: vendor ? vendor.company : 'Unknown Company',
          category: vendor ? vendor.category : 'N/A',
          status: vendor ? vendor.status : 'N/A',
          averageRating: parseFloat(item.averageRating.toFixed(2)),
          count: item.count,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: populatedAnalytics,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single vendor rating summary
// @route   GET /api/performance/vendor/:vendorId
// @access  Private
exports.getVendorPerformanceSummary = async (req, res, next) => {
  try {
    const vendorId = req.params.vendorId;

    const ratings = await PerformanceRating.find({ vendorId });
    if (ratings.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          averageRating: 0,
          count: 0,
          ratings: [],
        },
      });
    }

    const total = ratings.reduce((sum, r) => sum + r.rating, 0);
    const avg = parseFloat((total / ratings.length).toFixed(2));

    res.status(200).json({
      success: true,
      data: {
        averageRating: avg,
        count: ratings.length,
        ratings,
      },
    });
  } catch (err) {
    next(err);
  }
};
