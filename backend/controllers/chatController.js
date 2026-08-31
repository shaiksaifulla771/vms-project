const nvidiaAiService = require('../services/nvidiaAiService');
const llmService = require('../services/llmService');
const logger = require('../utils/logger');
const Material = require('../models/Material');
const BOM = require('../models/BOM');
const InventoryItem = require('../models/InventoryItem');
const { writeAuditLog } = require('../services/auditService');

/**
 * Standard Ask (Non-Streaming)
 * @route POST /api/chat/ask
 * @access Private
 */
exports.ask = async (req, res) => {
  try {
    const { prompt, context, history } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'A valid text prompt is required.' });
    }

    // Try NVIDIA Nemotron 3 Ultra 550B first
    try {
      const result = await nvidiaAiService.ask(prompt.trim(), context || {}, req.user, history || []);
      return res.status(200).json({
        success: true,
        engine: 'NVIDIA Nemotron 3 Ultra (550B)',
        data: result.text,
        reasoning: result.reasoning,
        draftedAction: result.draftedAction
      });
    } catch (nvidiaErr) {
      logger.warn('ChatController', 'NVIDIA NIM failed, falling back to secondary LLM service', nvidiaErr.message);
      
      // Secondary fallback
      const fallbackResult = await llmService.ask(prompt, context, req.user);
      if (fallbackResult.error) {
        return res.status(500).json({ success: false, error: fallbackResult.text });
      }
      return res.status(200).json({
        success: true,
        engine: 'Secondary LLM Fallback',
        data: fallbackResult.text,
        reasoning: null,
        draftedAction: null
      });
    }
  } catch (error) {
    logger.error('ChatController', 'Ask error', error);
    res.status(500).json({ success: false, error: 'Server error processing AI reasoning request.' });
  }
};

/**
 * Live Server-Sent Events (SSE) Deep Reasoning Stream
 * @route POST /api/chat/stream
 * @access Private
 */
exports.stream = async (req, res) => {
  try {
    const { prompt, context, history } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'A valid text prompt is required.' });
    }

    await nvidiaAiService.streamAsk(prompt.trim(), context || {}, req.user, res, history || []);
  } catch (error) {
    logger.error('ChatController', 'Stream error', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Streaming initialization failed.' });
    }
  }
};

/**
 * Human-in-the-Loop: Apply Drafted ERP Action
 * @route POST /api/chat/apply-action
 * @access Private
 */
exports.applyAction = async (req, res) => {
  try {
    const { action, targetEntity, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({ success: false, error: 'Invalid action payload.' });
    }

    // Role-based validation
    const allowedRoles = ['Admin', 'Production Manager', 'Inventory Manager', 'Planner'];
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to execute this ERP action.' });
    }

    let result = null;

    if (action === 'CREATE_MATERIAL' && targetEntity === 'Material') {
      const { generateNextMaterialCode } = require('../utils/userCodeGenerator');
      const code = payload.code || (await generateNextMaterialCode());
      result = await Material.create({
        ...payload,
        code,
        createdBy: req.user._id
      });
    } else if (action === 'UPDATE_REORDER_LEVEL' && targetEntity === 'Material') {
      result = await Material.findByIdAndUpdate(
        payload.materialId,
        { $set: { reorderLevel: payload.reorderLevel, safetyStock: payload.safetyStock } },
        { new: true }
      );
    } else {
      return res.status(400).json({ success: false, error: `Action ${action} is not yet supported for automated execution.` });
    }

    // Audit log
    await writeAuditLog({
      entityType: targetEntity,
      entityId: result._id,
      action: action,
      userId: req.user._id,
      userName: req.user.username,
      role: req.user.role,
      module: 'AI Copilot Action',
      reason: 'User confirmed drafted action proposed by NVIDIA Nemotron 3 Ultra Copilot',
      changes: payload
    });

    res.status(200).json({
      success: true,
      message: `Action ${action} executed successfully.`,
      data: result
    });
  } catch (error) {
    logger.error('ChatController', 'Apply action error', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to apply drafted action.' });
  }
};
