const mongoose = require('mongoose');

const PerformanceRatingSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Rating must be associated with a vendor'],
  },
  rating: {
    type: Number,
    required: [true, 'Please provide rating from 1 to 5'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
  },
  feedback: {
    type: String,
    required: [true, 'Please provide feedback/comments'],
    trim: true,
  },
  ratedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PerformanceRating', PerformanceRatingSchema);
