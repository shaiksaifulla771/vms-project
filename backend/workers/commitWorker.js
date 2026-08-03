const mongoose = require('mongoose');
const Staging = require('../models/Staging');
const { writeAuditLog } = require('../services/auditService');

const Vendor = require('../models/Vendor');
const Material = require('../models/Material');
// const BOM = require('../models/BOM'); // Add others as needed

const modelMap = {
  'Vendor': Vendor,
  'Material': Material
};

/**
 * Worker that reads validated rows from Staging and commits them to the live collections.
 * Handles chunking, tracking committedCount, and generating transaction-bound Audit Logs.
 */
module.exports = async function commitProcessor(job) {
  const { importJobId, userId } = job.data;
  
  if (!importJobId || !userId) {
    throw new Error('importJobId and userId are required job data.');
  }

  // Fetch pending rows for this job
  const pendingRows = await Staging.find({ jobId: importJobId, status: 'pending', validationErrors: { $size: 0 } }).sort({ rowNumber: 1 });
  
  if (pendingRows.length === 0) {
    return { status: 'no_pending_rows_to_commit', committedCount: 0 };
  }

  const entityType = pendingRows[0].entityType;
  const TargetModel = modelMap[entityType];

  if (!TargetModel) {
    throw new Error(`Unsupported entityType for commit: ${entityType}`);
  }

  const CHUNK_SIZE = 100;
  let committedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < pendingRows.length; i += CHUNK_SIZE) {
    const chunk = pendingRows.slice(i, i + CHUNK_SIZE);
    
    // We process the chunk row by row to maintain transactional boundaries per row 
    // and easily capture the diff for the audit log.
    for (const row of chunk) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Create new document instance
        const newDoc = new TargetModel(row.parsedData);
        await newDoc.save({ session });

        // Write audit log transactionally
        await writeAuditLog(
          session,
          entityType,
          newDoc._id,
          'IMPORT',
          null, // Before
          newDoc, // After
          userId
        );

        // Update staging status
        row.status = 'committed';
        await row.save({ session });

        await session.commitTransaction();
        committedCount++;
      } catch (err) {
        await session.abortTransaction();
        console.error(`Failed to commit row ${row.rowNumber}:`, err);
        
        // Mark staging row as failed (outside the aborted transaction)
        row.status = 'failed';
        row.commitError = err.message;
        await row.save();
        failedCount++;
      } finally {
        session.endSession();
      }
    }

    await job.updateProgress(Math.floor(((i + chunk.length) / pendingRows.length) * 100));
  }

  return { 
    status: 'commit_completed',
    committedCount,
    failedCount
  };
};
