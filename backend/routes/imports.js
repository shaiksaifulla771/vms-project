const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { importQueue, commitQueue } = require('../config/queue');
const { storage } = require('../storage');
const Staging = require('../models/Staging');

// Use multer with memory storage (since we upload to ObjectStorage abstraction)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route   POST /api/imports
 * @desc    Upload an Excel file to trigger Phase 1 (Parsing & Staging)
 * @access  Private
 */
router.post('/', protect, upload.single('file'), async (req, res) => {
  try {
    const { entityType } = req.body;
    
    if (!entityType) {
      return res.status(400).json({ success: false, error: 'entityType is required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload an excel or csv file' });
    }

    // 1. Upload the raw file buffer to our ObjectStorage abstraction
    const uniqueFileName = `${Date.now()}-${req.file.originalname}`;
    await storage.upload(req.file.buffer, uniqueFileName, req.file.mimetype);

    // 2. Enqueue Phase 1 job (importWorker)
    const job = await importQueue.add('process-import', {
      fileName: uniqueFileName,
      entityType,
      userId: req.user.id
    });

    res.status(202).json({
      success: true,
      message: 'File uploaded and import job queued',
      jobId: job.id
    });
  } catch (error) {
    console.error('Import upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to queue import job' });
  }
});

/**
 * @route   GET /api/imports/:jobId/status
 * @desc    Check the status of an import job and get staging stats
 * @access  Private
 */
router.get('/:jobId/status', protect, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await importQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;
    
    // Get staging summary if job has progressed
    const pendingCount = await Staging.countDocuments({ jobId, status: 'pending' });
    const errorsCount = await Staging.countDocuments({ jobId, status: 'pending', validationErrors: { $not: { $size: 0 } } });

    res.json({
      success: true,
      data: {
        id: job.id,
        state,
        progress,
        failedReason: job.failedReason,
        stagingSummary: {
          pendingRows: pendingCount,
          rowsWithErrors: errorsCount,
          validRows: pendingCount - errorsCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch job status' });
  }
});

/**
 * @route   POST /api/imports/:jobId/confirm
 * @desc    Trigger Phase 2 (Commit validated rows from Staging to Live Collections)
 * @access  Private
 */
router.post('/:jobId/confirm', protect, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Verify there are pending rows without errors
    const validPendingCount = await Staging.countDocuments({ jobId, status: 'pending', validationErrors: { $size: 0 } });
    
    if (validPendingCount === 0) {
      return res.status(400).json({ success: false, error: 'No valid pending rows to commit for this job' });
    }

    // Enqueue Phase 2 job (commitWorker)
    const commitJob = await commitQueue.add('commit-import', {
      importJobId: jobId,
      userId: req.user.id
    });

    res.status(202).json({
      success: true,
      message: 'Commit job queued',
      commitJobId: commitJob.id,
      rowsToCommit: validPendingCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to queue commit job' });
  }
});

module.exports = router;
