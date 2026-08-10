const AuditLog = require('../models/AuditLog');
const auditService = require('../services/auditService');

exports.getAuditLogs = async (req, res) => {
  try {
    const { entityType, entityId, action, userId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};

    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (action) query.action = action;
    if (userId) query.userId = userId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    
    const total = await AuditLog.countDocuments(query);
    
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getEntityHistory = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      entityType: req.params.type,
      entityId: req.params.id
    }).sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.exportAuditLogs = async (req, res) => {
  try {
    const { entityType, entityId, action, userId, startDate, endDate } = req.query;
    const query = {};

    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (action) query.action = action;
    if (userId) query.userId = userId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
    
    res.write('Timestamp,EntityType,EntityId,Action,UserId,IPAddress,CorrelationId,LegalHold\n');
    for (const log of logs) {
      res.write(`${log.timestamp.toISOString()},${log.entityType},${log.entityId},${log.action},${log.userId || ''},${log.ipAddress || ''},${log.correlationId || ''},${log.legalHold}\n`);
    }
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.verifyIntegrity = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await auditService.verifyChainIntegrity(startDate, endDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const mongoose = require('mongoose');

exports.setLegalHold = async (req, res) => {
  try {
    const { legalHold } = req.body;
    // Bypassing mongoose hooks by using the native collection
    const result = await AuditLog.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { legalHold: !!legalHold } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'AuditLog not found' });
    res.json({ message: 'Legal hold updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
