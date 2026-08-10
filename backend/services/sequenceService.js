const Sequence = require('../models/Sequence');

const DEFAULT_CONFIGS = {
  vendorCode: { prefix: 'V', padLength: 4, startSeq: 1001 },
  materialCode: { prefix: 'M', padLength: 4, startSeq: 1001 },
  poNumber: { prefix: 'PO', padLength: 5, startSeq: 10001 },
  prdNumber: { prefix: 'PRD', padLength: 5, startSeq: 10001 },
  planNumber: { prefix: 'PLN', padLength: 5, startSeq: 10001 },
};

/**
 * SequenceService — Thread-safe atomic auto-incrementing document code generator.
 * Eliminates race conditions by utilizing MongoDB atomic $inc operations.
 */
class SequenceService {
  /**
   * Generates the next sequential code for a given sequence name.
   * @param {String} sequenceName - e.g. 'vendorCode', 'materialCode', 'poNumber'
   * @param {Object} [customOptions] - { prefix, padLength }
   * @param {mongoose.ClientSession} [session] - Optional session for transactional code allocation
   */
  static async getNextCode(sequenceName, customOptions = {}, session = null) {
    const defaultConfig = DEFAULT_CONFIGS[sequenceName] || { prefix: '', padLength: 4, startSeq: 1001 };
    const prefix = customOptions.prefix !== undefined ? customOptions.prefix : defaultConfig.prefix;
    const padLength = customOptions.padLength !== undefined ? customOptions.padLength : defaultConfig.padLength;

    const opts = { new: true, upsert: true };
    if (session) opts.session = session;

    // Atomic $inc operation guarantees unique sequence allocation under high concurrency
    const updatedSeq = await Sequence.findByIdAndUpdate(
      sequenceName,
      {
        $inc: { seq: 1 },
        $setOnInsert: { _id: sequenceName },
        $set: { prefix, padLength, lastGeneratedAt: new Date() }
      },
      opts
    );

    const formattedNum = updatedSeq.seq.toString().padStart(padLength, '0');
    return `${prefix}${formattedNum}`;
  }
}

module.exports = SequenceService;
