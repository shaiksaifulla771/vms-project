require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const nvidiaAiService = require('../services/nvidiaAiService');

async function main() {
  console.log('====================================================');
  console.log('Testing NVIDIA Nemotron 3 Ultra 550B Reasoning Service');
  console.log('Model:', nvidiaAiService.modelName);
  console.log('Base URL:', nvidiaAiService.baseURL);
  console.log('====================================================');

  try {
    console.log('\n[1] Testing Non-Streaming Ask with Context Injection...');
    const result = await nvidiaAiService.ask(
      'Analyze raw material inventory health and explain how MRP lead times affect production planning.',
      { route: '/materials' },
      { username: 'test-admin', role: 'Admin' }
    );

    console.log('\n--- Model Response ---');
    console.log('Engine:', result.model);
    if (result.reasoning) {
      console.log('\n[Reasoning Thought Chain]:');
      console.log(result.reasoning.slice(0, 300) + '... (truncated)');
    }
    console.log('\n[Final Answer]:');
    console.log(result.text.slice(0, 500) + '... (truncated)');
    console.log('\n✅ NVIDIA Nemotron 3 Ultra Integration Test PASSED!');
  } catch (err) {
    console.error('❌ Integration Test Failed:', err.message);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
