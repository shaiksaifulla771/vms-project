const mcpService = require('../../services/mcpService');

describe('VMS MCP Service & Security Guards Unit Tests', () => {
  test('getAvailableTools returns array of safe exposed tools', () => {
    const tools = mcpService.getAvailableTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.some(t => t.name === 'create_visitor')).toBe(true);
    expect(tools.some(t => t.name === 'create_appointment')).toBe(true);
  });

  test('executeTool rejects unauthenticated calls', async () => {
    await expect(mcpService.executeTool('list_plugins', {}, null)).rejects.toThrow('MCP Security Violation: Unauthenticated tool call rejected');
  });

  test('executeTool rejects destructive raw SQL / shell attempts', async () => {
    const mockUser = { _id: '507f1f77bcf86cd799439011', username: 'Admin', role: 'Admin' };
    await expect(mcpService.executeTool('list_plugins', { raw: 'executeRawSQL drop table' }, mockUser))
      .rejects.toThrow('MCP Security Violation: Destructive command rejected by VMS security guard');
  });
});
