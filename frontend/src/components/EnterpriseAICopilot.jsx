import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Sparkles,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Layers,
  ArrowRight,
  Maximize2,
  Minimize2
} from 'lucide-react';

const QUICK_PROMPTS = {
  materials: [
    'Check inventory health and identify low-stock items',
    'Draft a new Raw Material record for packaging',
    'Explain how BOM component prices affect standard costs'
  ],
  vendors: [
    'Analyze vendor onboarding compliance and GSTIN status',
    'Identify top suppliers and lead time risks',
    'Suggest vendor evaluation criteria'
  ],
  mpns: [
    'Analyze MPN price trends and supplier variances',
    'Suggest alternative MPN part numbers for cost reduction',
    'Explain MPN lead time impact on safety stock'
  ],
  inventory: [
    'Identify critical stock shortages across warehouses',
    'Optimize safety stock and reorder point levels',
    'Summarize total inventory valuation and reserved stock'
  ],
  bom: [
    'Explain the total cost breakdown of this BOM recipe',
    'Calculate component requirements for a 500-unit batch',
    'Suggest scrap loss percentage reductions'
  ],
  planning: [
    'Explain current production schedule bottlenecks',
    'Evaluate material shortage risks for upcoming plans',
    'Recommend purchase requisition priorities'
  ],
  users: [
    'Audit Segregation of Duties (SoD) across roles',
    'Summarize pending access requests and recommendations',
    'Review multi-site permission matrix'
  ]
};

const EnterpriseAICopilot = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am your **NVIDIA Nemotron 3 Ultra 550B Enterprise Copilot**. I have live operational context across your ERP & VMS modules. How can I assist your supply chain, inventory, or production operations today?',
      reasoning: null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [appliedActionIds, setAppliedActionIds] = useState(new Set());
  const [actionApplyingId, setActionApplyingId] = useState(null);

  const messagesEndRef = useRef(null);

  const currentRoute = location.pathname.split('/')[1] || 'materials';
  const activePromptList = QUICK_PROMPTS[currentRoute] || QUICK_PROMPTS.materials;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentThinking, isOpen]);

  // Keyboard shortcut Ctrl+K / Cmd+K to toggle Copilot
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSendMessage = async (customText = null) => {
    const promptToSend = (customText || inputPrompt).trim();
    if (!promptToSend || isLoading) return;

    const userMessageId = Date.now().toString();
    const newUserMsg = {
      id: userMessageId,
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInputPrompt('');
    setIsLoading(true);
    setCurrentThinking('');
    setIsThinkingOpen(true);

    try {
      // Build conversation history for continuous memory
      const history = messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      // Call standard AI ask endpoint with live enterprise context & conversation memory
      const res = await api.post('/api/chat/ask', {
        prompt: promptToSend,
        history,
        context: {
          route: location.pathname,
          module: currentRoute,
          userRole: user?.role
        }
      });

      const responseData = res.data;
      const aiMessageId = (Date.now() + 1).toString();

      setMessages(prev => [
        ...prev,
        {
          id: aiMessageId,
          sender: 'ai',
          text: responseData.data || 'No response generated.',
          reasoning: responseData.reasoning || null,
          draftedAction: responseData.draftedAction || null,
          engine: responseData.engine || 'NVIDIA Nemotron 3 Ultra (550B)',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Copilot Ask Error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `⚠️ **Error communicating with NVIDIA AI Reasoning Engine:** ${err.response?.data?.error || err.message}`,
          reasoning: null,
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
      setCurrentThinking('');
    }
  };

  const handleApplyAction = async (msgId, actionData) => {
    if (!actionData) return;
    setActionApplyingId(msgId);
    try {
      const res = await api.post('/api/chat/apply-action', actionData);
      setAppliedActionIds(prev => new Set(prev).add(msgId));
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'ai',
          text: `✅ **Action Applied Successfully:** ${res.data.message || 'ERP database updated and logged to audit trail.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Apply Action Error:', err);
      alert(`Failed to execute action: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionApplyingId(null);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'ai',
        text: 'Chat history cleared. I am ready for your next ERP or supply chain reasoning query.',
        reasoning: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 bg-gradient-to-r from-blue-700 via-indigo-700 to-emerald-700 hover:from-blue-600 hover:to-emerald-600 text-white px-3.5 py-2.5 rounded-full shadow-2xl shadow-indigo-500/40 border border-white/20 transition-all duration-200 hover:scale-105 group"
          title="Open NVIDIA Nemotron 3 Ultra AI Copilot (Ctrl+K)"
        >
          <div className="relative">
            <Cpu className="h-4 w-4 animate-pulse text-emerald-300" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-xs font-black tracking-wide pr-1">NVIDIA Nemotron 3 Ultra</span>
          <span className="text-[9px] bg-black/30 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 font-mono hidden sm:inline-block">
            Ctrl+K
          </span>
        </button>
      )}

      {/* Floating Copilot Modal / Drawer */}
      {isOpen && (
        <div
          className={`fixed bottom-4 right-4 z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ${
            isExpanded
              ? 'w-[95vw] sm:w-[680px] h-[85vh]'
              : 'w-[95vw] sm:w-[460px] h-[600px]'
          }`}
        >
          {/* Header Bar */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 rounded-t-2xl">
            <div className="flex items-center space-x-2.5">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-md">
                <BrainCircuit className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Enterprise Copilot</h3>
                  <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Nemotron 550B
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  <Layers className="h-3 w-3 text-blue-400 inline" /> Context: <strong className="text-slate-200 capitalize">{currentRoute}</strong>
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={clearChat}
                className="p-1.5 text-slate-400 hover:text-rose-300 hover:bg-slate-800 rounded-lg transition-colors"
                title="Clear Chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors hidden sm:block"
                title={isExpanded ? 'Minimize' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Close Copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Context Action Prompts */}
          <div className="px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/60 overflow-x-auto flex gap-1.5 select-none no-scrollbar">
            {activePromptList.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="whitespace-nowrap bg-slate-800/80 hover:bg-blue-900/40 border border-slate-700/60 hover:border-blue-500/40 text-[10px] font-medium text-slate-300 hover:text-blue-200 px-2 py-1 rounded-md transition-colors shrink-0"
              >
                ⚡ {prompt}
              </button>
            ))}
          </div>

          {/* Message Thread */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Sender badge & timestamp */}
                <div className="flex items-center space-x-1 text-[9px] text-slate-500 mb-1 px-1">
                  <span>{msg.sender === 'user' ? user?.username || 'You' : 'NVIDIA Nemotron 3 Ultra'}</span>
                  <span>&bull;</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[90%] rounded-xl p-3 shadow-md ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none font-medium'
                      : msg.isError
                      ? 'bg-rose-950/60 border border-rose-800 text-rose-200 rounded-bl-none'
                      : 'bg-slate-800/90 border border-slate-700/80 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {/* Final Output Content */}
                  <div className="whitespace-pre-wrap leading-relaxed text-[11px]">
                    {msg.text}
                  </div>

                  {/* Interactive Action Proposal Card */}
                  {msg.draftedAction && (
                    <div className="mt-3 p-2.5 bg-slate-900/90 border border-blue-500/40 rounded-lg shadow-inner space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase text-blue-400 tracking-wider flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Proposed Action
                        </span>
                        <span className="text-[9px] bg-blue-500/20 text-blue-300 font-mono px-1.5 py-0.5 rounded">
                          {msg.draftedAction.action}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 font-medium">{msg.draftedAction.summary}</p>
                      
                      <button
                        onClick={() => handleApplyAction(msg.id, msg.draftedAction)}
                        disabled={appliedActionIds.has(msg.id) || actionApplyingId === msg.id}
                        className={`w-full py-1.5 px-3 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                          appliedActionIds.has(msg.id)
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                        }`}
                      >
                        {actionApplyingId === msg.id ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" /> Applying Changes...
                          </>
                        ) : appliedActionIds.has(msg.id) ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Action Applied to Database
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Confirm &amp; Apply Action
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Live Loading Pulse */}
            {isLoading && (
              <div className="flex flex-col items-start space-y-1">
                <div className="flex items-center space-x-1 text-[9px] text-slate-500 px-1">
                  <span>Enterprise Copilot</span>
                  <span>&bull;</span>
                  <span>Fetching...</span>
                </div>
                <div className="bg-slate-800/90 border border-slate-700/80 text-slate-200 rounded-xl rounded-bl-none p-2.5 shadow-md flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent"></div>
                  <span className="text-[11px] text-slate-300 font-medium animate-pulse">
                    Querying live enterprise records...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-950/80 rounded-b-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center space-x-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={`Ask Nemotron 3 Ultra about ${currentRoute}...`}
                disabled={isLoading}
                className="flex-1 bg-slate-900 border border-slate-700/80 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                className="h-8 w-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shrink-0 shadow-md shadow-blue-600/30 cursor-pointer"
                title="Send query"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default EnterpriseAICopilot;
