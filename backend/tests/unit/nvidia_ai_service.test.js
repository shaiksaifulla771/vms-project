const nvidiaAiService = require('../../services/nvidiaAiService');

describe('NVIDIA Nemotron 3 Ultra 550B Enterprise AI Service Tests', () => {
  beforeAll(() => {
    process.env.NVIDIA_API_KEY = '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';
    process.env.NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
    process.env.NVIDIA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
  });

  test('Should properly initialize client configuration with NVIDIA NIM parameters', () => {
    const client = nvidiaAiService.getClient();
    expect(client).toBeDefined();
    expect(nvidiaAiService.modelName).toBe('nvidia/nemotron-3-ultra-550b-a55b');
    expect(nvidiaAiService.baseURL).toBe('https://integrate.api.nvidia.com/v1');
  });

  test('Should build dynamic multi-domain context for Materials module', async () => {
    const context = await nvidiaAiService.buildEnterpriseContext(
      { route: '/materials' },
      { username: 'admin-user', role: 'Admin' }
    );
    expect(context).toContain('User: admin-user');
    expect(context).toContain('Role: Admin');
  });

  test('Should build dynamic multi-domain context for Stocks & MPN module', async () => {
    const context = await nvidiaAiService.buildEnterpriseContext(
      { route: '/mpns' },
      { username: 'planner-user', role: 'Planner' }
    );
    expect(context).toContain('User: planner-user');
  });

  test('Should generate system prompt containing Human-in-the-Loop rules and Action schema', () => {
    const prompt = nvidiaAiService.getSystemPrompt('Sample Live Context');
    expect(prompt).toContain('NVIDIA Nemotron 3 Ultra 550B Reasoning Engine');
    expect(prompt).toContain('HUMAN-IN-THE-LOOP SAFETY');
    expect(prompt).toContain('drafted_erp_action');
    expect(prompt).toContain('Sample Live Context');
  });

  test('Should parse drafted ERP action JSON blocks correctly', () => {
    const sampleOutput = `Here is my reasoning. Based on your low stock alert, I have drafted the following material update:
\`\`\`json
{
  "_type": "drafted_erp_action",
  "action": "UPDATE_REORDER_LEVEL",
  "targetEntity": "Material",
  "payload": {
    "materialId": "65e0123456789abcdef01234",
    "reorderLevel": 250,
    "safetyStock": 100
  },
  "summary": "Increase reorder level to 250 units due to lead time variance."
}
\`\`\`
Please confirm to apply this change.`;

    const match = sampleOutput.match(/```json\s*(\{[\s\S]*?"_type":\s*"drafted_erp_action"[\s\S]*?\})\s*```/);
    expect(match).not.toBeNull();
    const action = JSON.parse(match[1]);
    expect(action._type).toBe('drafted_erp_action');
    expect(action.action).toBe('UPDATE_REORDER_LEVEL');
    expect(action.payload.reorderLevel).toBe(250);
  });
});
