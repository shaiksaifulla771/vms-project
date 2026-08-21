const llmService = require('../services/llmService');

exports.ask = async (req, res) => {
  try {
    const { prompt, context } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // req.user is available because the route will use the 'protect' middleware.
    // In the future, tools called within llmService can check req.user.role.
    const result = await llmService.ask(prompt, context, req.user);

    if (result.error) {
      return res.status(500).json({ success: false, error: result.text });
    }

    res.status(200).json({ success: true, data: result.text });
  } catch (error) {
    console.error('Chat Controller Error:', error);
    res.status(500).json({ success: false, error: 'Server error processing chat request' });
  }
};
