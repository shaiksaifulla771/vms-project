const { OpenAI } = require('openai');
const mongoose = require('mongoose');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const MPN = require('../models/MPN');
const InventoryItem = require('../models/InventoryItem');
const BOM = require('../models/BOM');
const ProductionPlan = require('../models/ProductionPlan');
const ProductionOrder = require('../models/ProductionOrder');
const User = require('../models/User');
const logger = require('../utils/logger');
const authz = require('../utils/authz');
const scopeResolver = require('../utils/scopeResolver');

class NvidiaAiService {
  constructor() {
    this.client = null;
    this.modelName = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
    this.baseURL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  }

  getClient() {
    if (!this.client) {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        throw new Error('NVIDIA_API_KEY is not configured in environment variables.');
      }
      this.client = new OpenAI({
        baseURL: this.baseURL,
        apiKey: apiKey
      });
    }
    return this.client;
  }

  /**
   * High-Performance Enterprise Multi-Domain Context Builder
   * Gathers live operational database state across all ERP/VMS modules with sub-50ms execution
   */
  async buildEnterpriseContext(promptOrContext = '', contextOrUser = {}, maybeUser = null) {
    try {
      let prompt = '';
      let context = {};
      let user = null;

      if (typeof promptOrContext === 'object' && promptOrContext !== null) {
        context = promptOrContext;
        user = contextOrUser || null;
        prompt = '';
      } else {
        prompt = typeof promptOrContext === 'string' ? promptOrContext : '';
        context = (typeof contextOrUser === 'object' && contextOrUser !== null) ? contextOrUser : {};
        user = maybeUser;
      }

      const route = (context.route || '').toLowerCase();
      const p = (prompt || '').toLowerCase();
      let contextBlocks = [];

      // 1. Current User Session Context
      if (user) {
        const isGlobal = authz.isGlobalAdmin(user);
        let userScopeDesc = `[USER SESSION] User: ${user.username || user.email} | Caller: ${user.username || user.email} | Role: ${user.role} | Global Admin: ${isGlobal}`;
        contextBlocks.push(userScopeDesc);
      }

      if (mongoose.connection.readyState !== 1) {
        contextBlocks.push('[SYSTEM STATUS] Database: Initializing.');
        return contextBlocks.join('\n\n');
      }

      // 2. Today's Date Range (Midnight to Now)
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 3. Fast Parallel Projections
      const [
        totalMaterials,
        rawMaterialsCount,
        finishedGoodsCount,
        materialsAddedToday,
        rawMaterialsAddedToday,
        totalVendors,
        activeVendors,
        totalInventoryItems,
        inventoryValuationAgg,
        totalBoms,
        totalUsers,
        activeUsersCount
      ] = await Promise.all([
        Material.countDocuments({ status: { $ne: 'Deleted' } }),
        Material.countDocuments({ type: 'Raw Material', status: { $ne: 'Deleted' } }),
        Material.countDocuments({ type: 'Finished', status: { $ne: 'Deleted' } }),
        Material.find({ createdAt: { $gte: startOfToday }, status: { $ne: 'Deleted' } }).select('name code type unit basePrice createdAt').lean(),
        Material.find({ type: 'Raw Material', createdAt: { $gte: startOfToday }, status: { $ne: 'Deleted' } }).select('name code type unit basePrice createdAt').lean(),
        Vendor.countDocuments({ status: { $ne: 'Deleted' } }),
        Vendor.countDocuments({ status: 'Active' }),
        InventoryItem.countDocuments(),
        InventoryItem.aggregate([
          { $group: { _id: null, totalBalance: { $sum: '$balance' }, totalReserved: { $sum: '$reserved' } } }
        ]),
        BOM.countDocuments({ status: { $ne: 'Deleted' } }),
        User.countDocuments(),
        User.countDocuments({ accountStatus: { $in: ['ACTIVE', 'active'] } })
      ]);

      const onHandUnits = inventoryValuationAgg[0]?.totalBalance || 0;
      const reservedUnits = inventoryValuationAgg[0]?.totalReserved || 0;
      const availableUnits = Math.max(0, onHandUnits - reservedUnits);

      // Core System Overview (compact for high speed)
      contextBlocks.push(`[LIVE ERP TOTALS as of ${now.toISOString()}]
- Materials in Catalog: ${totalMaterials} (Raw Materials: ${rawMaterialsCount}, Finished Goods: ${finishedGoodsCount})
- Materials Added Today (${startOfToday.toLocaleDateString()}): ${materialsAddedToday.length} total (${rawMaterialsAddedToday.length} Raw Materials)
- Registered Vendors: ${totalVendors} (Active: ${activeVendors})
- Inventory On-Hand: ${onHandUnits} units (Available: ${availableUnits}, Reserved: ${reservedUnits}) across ${totalInventoryItems} batches
- Active BOM Recipes: ${totalBoms}
- Total Users: ${totalUsers} (Active: ${activeUsersCount})`);

      // 4. Targeted Query-Driven Context
      const isAskingMaterials = p.includes('material') || p.includes('raw') || p.includes('finished') || p.includes('added') || p.includes('today') || route.includes('material');
      const isAskingVendors = p.includes('vendor') || p.includes('supplier') || route.includes('vendor');
      const isAskingInventory = p.includes('inventory') || p.includes('stock') || p.includes('balance') || p.includes('warehouse') || route.includes('inventory');
      const isAskingUsers = p.includes('user') || p.includes('role') || p.includes('permission') || route.includes('user');

      // Materials Detail
      if (isAskingMaterials || materialsAddedToday.length > 0) {
        const topMaterials = await Material.find({ status: { $ne: 'Deleted' } })
          .select('name code type unit basePrice createdAt')
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        let matSummary = `[MATERIALS DATA]\n`;
        if (rawMaterialsAddedToday.length > 0) {
          matSummary += `Raw Materials Added Today (${rawMaterialsAddedToday.length} items):\n${rawMaterialsAddedToday.map((m, i) => `${i + 1}. [${m.code}] ${m.name} (${m.unit || 'pcs'}, Base Price: ₹${m.basePrice || 0})`).join('\n')}\n\n`;
        } else {
          matSummary += `Raw Materials Added Today: 0 new raw materials created today.\n\n`;
        }
        matSummary += `Recent Catalog Materials:\n${topMaterials.map((m, i) => `${i + 1}. [${m.code}] ${m.name} - ${m.type} (${m.unit || 'pcs'})`).join('\n')}`;
        contextBlocks.push(matSummary);
      }

      // Vendors Detail
      if (isAskingVendors || p.includes('vendor') || p.includes('list')) {
        const vendorList = await Vendor.find({ status: { $ne: 'Deleted' } })
          .select('name vendorId company category status gstin')
          .limit(20)
          .lean();

        contextBlocks.push(`[REGISTERED VENDORS (${vendorList.length} of ${totalVendors})]\n${vendorList.map((v, i) => `${i + 1}. ${v.name || v.company} (${v.vendorId || 'VEND'}) - Status: ${v.status}, Category: ${v.category || 'General'}`).join('\n')}`);
      }

      // Inventory Detail
      if (isAskingInventory) {
        const topBalances = await InventoryItem.find()
          .populate('materialId', 'name code')
          .populate('warehouseId', 'name')
          .limit(10)
          .lean();

        contextBlocks.push(`[INVENTORY STOCK SNAPSHOT]\n${topBalances.map(b => `- ${b.materialId?.name || 'Item'} (${b.materialId?.code}): On-Hand: ${b.balance}, Avail: ${Math.max(0, (b.balance || 0) - (b.reserved || 0))} @ ${b.warehouseId?.name || 'Warehouse'}`).join('\n')}`);
      }

      // Users Detail
      if (isAskingUsers) {
        const userList = await User.find()
          .select('username email role accountStatus')
          .limit(15)
          .lean();

        contextBlocks.push(`[USERS DIRECTORY]\n${userList.map(u => `- ${u.username} (${u.email}) - Role: ${u.role}, Status: ${u.accountStatus || 'ACTIVE'}`).join('\n')}`);
      }

      return contextBlocks.join('\n\n');
    } catch (err) {
      logger.warn('NvidiaAiService', 'Context aggregation warning', err.message);
      return 'Operational database context partially available.';
    }
  }

  /**
   * System Prompt Generator
   */
  getSystemPrompt(enterpriseContext) {
    return `
You are the **Senior Enterprise Operations Copilot for VendorOS ERP & VMS**, powered by **NVIDIA Nemotron 3 Ultra 550B Reasoning Engine**.

### OPERATIONAL GUIDELINES:
1. **EXECUTIVE CONCISENESS & SPEED:** Be direct, structured, and fast. Avoid lengthy disclaimers or raw sequential listing of dozens of items.
2. **DATA PRESENTATION:**
   - Always state the **exact aggregate number** prominently (e.g., "**86 Raw Materials Added Today**", "**43 Active Vendors**").
   - For listings, provide a clean structured breakdown by category or a concise table of the **top 10 most relevant items** followed by a summary note.
   - Present clean, crisp markdown with bold headers and compact tables.
3. **ACCURACY:** Answer quantitative and list questions using the exact numbers and items in [LIVE ENTERPRISE CONTEXT].
4. **HUMAN-IN-THE-LOOP SAFETY:** For record creation or modifications, output an optional drafted action JSON block with "_type": "drafted_erp_action".

### LIVE ENTERPRISE CONTEXT:
${enterpriseContext}
`;
  }

  /**
   * Standard High-Speed Chat Completion
   */
  async ask(prompt, context = {}, user = null, history = []) {
    const client = this.getClient();
    const enterpriseContext = await this.buildEnterpriseContext(prompt, context, user);
    const systemPrompt = this.getSystemPrompt(enterpriseContext);

    const messages = [{ role: 'system', content: systemPrompt }];

    if (Array.isArray(history) && history.length > 0) {
      history.slice(-4).forEach(msg => {
        if (msg.content && typeof msg.content === 'string') {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        }
      });
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const completion = await client.chat.completions.create({
        model: this.modelName,
        messages: messages,
        temperature: 0.15,
        top_p: 0.9,
        max_tokens: 1024 // Optimized token limit for sub-second generation
      });

      const choice = completion.choices[0];
      const message = choice.message;
      const content = message.content || '';

      // Parse drafted action if present
      let draftedAction = null;
      const actionMatch = content.match(/```json\s*(\{[\s\S]*?"_type":\s*"drafted_erp_action"[\s\S]*?\})\s*```/);
      if (actionMatch) {
        try {
          draftedAction = JSON.parse(actionMatch[1]);
        } catch (e) {}
      }

      return {
        success: true,
        model: this.modelName,
        reasoning: null, // Strip raw reasoning scratchpad for clean professional output
        text: content,
        draftedAction
      };
    } catch (err) {
      logger.error('NvidiaAiService', 'Chat completion error', err);
      throw err;
    }
  }

  /**
   * Real-Time Server-Sent Events (SSE) Stream
   */
  async streamAsk(prompt, context = {}, user = null, res, history = []) {
    const client = this.getClient();
    const enterpriseContext = await this.buildEnterpriseContext(prompt, context, user);
    const systemPrompt = this.getSystemPrompt(enterpriseContext);

    const messages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(history) && history.length > 0) {
      history.slice(-4).forEach(msg => {
        if (msg.content && typeof msg.content === 'string') {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        }
      });
    }
    messages.push({ role: 'user', content: prompt });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = await client.chat.completions.create({
        model: this.modelName,
        messages: messages,
        temperature: 0.15,
        top_p: 0.9,
        max_tokens: 1024,
        stream: true
      });

      for await (const chunk of stream) {
        if (!chunk.choices || chunk.choices.length === 0) continue;
        const delta = chunk.choices[0].delta;

        if (delta.content) {
          res.write(`event: content\ndata: ${JSON.stringify({ chunk: delta.content })}\n\n`);
        }
      }

      res.write(`event: done\ndata: ${JSON.stringify({ success: true, model: this.modelName })}\n\n`);
      res.end();
    } catch (err) {
      logger.error('NvidiaAiService', 'Streaming error', err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'AI streaming failed.' })}\n\n`);
      res.end();
    }
  }
}

module.exports = new NvidiaAiService();
