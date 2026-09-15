const { GoogleGenerativeAI } = require('@google/generative-ai');
const BOM = require('../models/BOM');
const Material = require('../models/Material');
const MPN = require('../models/MPN');

class LLMService {
  constructor() {
    this.genAI = null;
    this.model = null;
  }

  init() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY is missing. LLM features will be disabled.');
      return;
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // or gemini-2.5-pro
  }

  async ask(prompt, context, user) {
    if (!this.model) this.init();
    if (!this.model) {
      return { text: "LLM integration is currently disabled because GEMINI_API_KEY is not configured.", error: true };
    }

    try {
      // Step 1: Collect Context Data (Enforcing RBAC)
      let contextDataStr = "";
      const isPrivileged = user && (user.role === 'Admin' || user.role === 'Production Manager' || user.role === 'Inventory Manager');

      if (context && context.route) {
        if (context.route.startsWith('/bom/')) {
          if (!isPrivileged) {
            contextDataStr = `Context Warning: The requested BOM is restricted. The current user (${user?.role}) does not have permission to view or edit this resource.\n\n`;
          } else {
            const bomId = context.route.split('/')[2];
            if (bomId && bomId !== 'new') {
              const bom = await BOM.findById(bomId).populate('productId components.mpnId');
              if (bom) {
                contextDataStr = `Current BOM Context: \n${JSON.stringify(bom, null, 2)}\n\n`;
              } else {
                contextDataStr = `Context Warning: The requested BOM (${bomId}) was not found or access is restricted.\n\n`;
              }
            }
          }
        } else if (context.route.startsWith('/masters')) {
          contextDataStr = `User is currently viewing the Masters (Materials/Vendors) section.\n\n`;
        }
      }

      // Step 2: System Instructions
      const systemInstruction = `
You are a highly capable AI Assistant integrated into the VMS ERP application.
Your role is to assist users with Cost Explanation, Bill of Materials (BOM) creation, and general queries.

IMPORTANT SECURITY & DESIGN RULES:
1. STRICTLY DRAFTED ACTIONS: You are explicitly forbidden from executing any database writes or actions directly. You MUST ALWAYS return a structured JSON payload drafted for the user's review. A real database write will only happen when the user explicitly clicks an "Apply and save" button in the UI.
2. RBAC COMPLIANCE: If the user lacks permission for something (e.g., viewing a restricted material), plainly explain that the data is restricted.
3. CONTEXT AWARENESS: Utilize the provided context data to answer context-specific questions.

If you are generating a drafted BOM payload, output it in a JSON code block using this schema:
\`\`\`json
{
  "_type": "drafted_bom_payload",
  "productId": "<material id for the assembly>",
  "batchSize": <number>,
  "batchUOM": "<string>",
  "components": [
    { "mpnId": "<mpn id>", "qty": <number>, "lossPercent": <number> }
  ]
}
\`\`\`
The frontend will parse this block and render an "Apply and Save" button.

When explaining costs, be clear, concise, and highlight the MPNs and line costs responsible for the total cost.
`;

      // Step 3: Available Tools/Data Fetching (LLM Function Calling)
      // For MVP, we will fetch data manually based on the prompt or inject basic data.
      // E.g., if the user asks for materials, we fetch a brief list.
      let toolsData = "";
      if (prompt.toLowerCase().includes('steel') || prompt.toLowerCase().includes('plastic') || prompt.toLowerCase().includes('rubber')) {
        const materials = await Material.find({ name: { $regex: 'Steel|Plastic|Rubber', $options: 'i' } }).limit(10);
        if (materials.length > 0) {
          toolsData = `Available Materials found matching prompt:\n${JSON.stringify(materials.map(m => ({ id: m._id, name: m.name })), null, 2)}\n\n`;
        }
      }
      
      const mpns = await MPN.find().limit(20).populate('materialId');
      toolsData += `Sample MPNs available for drafting:\n${JSON.stringify(mpns.map(m => ({ mpnId: m._id, mpnCode: m.mpnCode, materialName: m.materialId?.name, price: m.price })), null, 2)}\n\n`;

      const finalPrompt = `${systemInstruction}\n\n${contextDataStr}${toolsData}User Query: ${prompt}`;

      const result = await this.model.generateContent(finalPrompt);
      const responseText = result.response.text();

      return { text: responseText, success: true };
    } catch (error) {
      console.error('LLM Service Error:', error);
      return { text: "An error occurred while communicating with the AI assistant.", success: false, error: error.message };
    }
  }
}

module.exports = new LLMService();
