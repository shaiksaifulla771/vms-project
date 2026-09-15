const pluginManagerService = require('../services/pluginManagerService');
const asyncHandler = require('../middleware/asyncHandler');

exports.getPlugins = asyncHandler(async (req, res) => {
  const plugins = await pluginManagerService.listPlugins();
  res.status(200).json({ success: true, count: plugins.length, data: plugins });
});

exports.enablePlugin = asyncHandler(async (req, res) => {
  const plugin = await pluginManagerService.enablePlugin(req.params.code, req.user._id);
  res.status(200).json({ success: true, message: `Plugin ${req.params.code} enabled`, data: plugin });
});

exports.disablePlugin = asyncHandler(async (req, res) => {
  const plugin = await pluginManagerService.disablePlugin(req.params.code, req.user._id);
  res.status(200).json({ success: true, message: `Plugin ${req.params.code} disabled`, data: plugin });
});

exports.checkPluginHealth = asyncHandler(async (req, res) => {
  const health = await pluginManagerService.healthCheck(req.params.code);
  res.status(200).json({ success: true, data: health });
});
