const mcpService = require('../services/mcpService');
const asyncHandler = require('../middleware/asyncHandler');

exports.getAvailableTools = asyncHandler(async (req, res) => {
  const tools = mcpService.getAvailableTools();
  res.status(200).json({ success: true, count: tools.length, data: tools });
});

exports.executeTool = asyncHandler(async (req, res) => {
  const { toolName, params } = req.body;
  if (!toolName) {
    return res.status(400).json({ success: false, error: 'Please specify toolName' });
  }

  const result = await mcpService.executeTool(toolName, params || {}, req.user);
  res.status(200).json({ success: true, toolName, data: result });
});
