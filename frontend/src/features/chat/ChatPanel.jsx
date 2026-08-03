import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Sparkles, PlusCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Button } from '../../components/ui/Button';

export default function ChatPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! I am your AI Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const res = await api.post('/api/chat/ask', {
        prompt: userMessage,
        context: { route: location.pathname }
      });

      if (res.data.success) {
        setMessages(prev => [...prev, { role: 'assistant', text: res.data.data }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${res.data.error}` }]);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || 'An error occurred';
      setMessages(prev => [...prev, { role: 'assistant', text: `System Error: ${errorMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const parseMessageText = (text) => {
    // Look for JSON code blocks
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/g;
    let parts = [];
    let lastIndex = 0;
    let match;

    while ((match = jsonBlockRegex.exec(text)) !== null) {
      // Add text before JSON
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      
      // Parse JSON
      try {
        const payload = JSON.parse(match[1]);
        if (payload._type === 'drafted_bom_payload') {
          parts.push({ type: 'bom_draft', payload });
        } else {
          parts.push({ type: 'json', content: match[1] }); // Generic JSON
        }
      } catch (err) {
        parts.push({ type: 'text', content: match[0] }); // Failed to parse, show as text
      }
      
      lastIndex = jsonBlockRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  };

  const handleApplyDraft = (payload) => {
    // Close chat and navigate to BOM new with payload in state
    onClose();
    navigate('/bom/new', { state: { draftPayload: payload } });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 z-[90] backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[100] flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur">
              <div className="flex items-center space-x-2">
                <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">VMS AI Assistant</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Context-Aware Help & Operations</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                  <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-100 text-blue-600 ml-2' : 'bg-indigo-100 text-indigo-600 mr-2'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    
                    <div className={`rounded-xl p-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        <div className="space-y-3">
                          {parseMessageText(msg.text).map((part, pIdx) => {
                            if (part.type === 'text') {
                              return <p key={pIdx} className="whitespace-pre-wrap leading-relaxed">{part.content}</p>;
                            } else if (part.type === 'bom_draft') {
                              return (
                                <div key={pIdx} className="bg-slate-50 border border-indigo-100 rounded-lg p-3 my-2 space-y-2">
                                  <div className="flex items-center text-indigo-700 font-bold text-xs uppercase tracking-wider mb-2">
                                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                                    Drafted Recipe Payload
                                  </div>
                                  <div className="text-xs text-slate-600 bg-white p-2 border border-slate-100 rounded font-mono">
                                    Batch: {part.payload.batchSize} {part.payload.batchUOM}<br/>
                                    Components: {part.payload.components?.length || 0}
                                  </div>
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleApplyDraft(part.payload)}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 text-xs flex items-center justify-center"
                                  >
                                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                                    Review & Apply Draft
                                  </Button>
                                </div>
                              );
                            } else {
                              return (
                                <pre key={pIdx} className="bg-slate-800 text-slate-300 p-2 rounded-lg text-xs overflow-x-auto">
                                  {part.content}
                                </pre>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start w-full">
                  <div className="flex max-w-[85%] flex-row">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600 mr-2">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl rounded-tl-none p-4 shadow-sm flex items-center space-x-2">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100">
              <form onSubmit={handleSend} className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask the AI Assistant..."
                  disabled={loading}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="absolute right-1.5 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <div className="text-center mt-2 text-[10px] font-medium text-slate-400">
                AI can make mistakes. Please review drafted actions.
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
