'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  X,
  Minus,
  Send,
  Bot,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  Clock
} from 'lucide-react';

export interface IPublicChatReceiptContext {
  receiptNo?: string;
  receipt?: string;
  marka?: string;
  party?: string;
  itemName?: string;
  commodity?: string;
  english?: string;
  ctn?: string | number;
  quantity?: string | number;
  cartons?: string | number;
  cbm?: string | number;
  weight?: string | number;
  status?: string;
  containerNo?: string;
  container?: string;
  eta?: string | null;
  previousEta?: string | null;
  isEtaUpdated?: boolean;
  etaChangeMessage?: string | null;
  deliveryDate?: string | null;
}

interface PublicCargoChatBotProps {
  token?: string;
  receipts?: IPublicChatReceiptContext[];
  trackingName?: string;
  /**
   * If true, the chatbot will automatically hide/remove itself after all items
   * have been loaded into container (status = Loaded / In Transit / Delivered)
   */
  hideAfterLoaded?: boolean;
  /**
   * Whether to allow the user to completely dismiss/remove the chatbot from screen
   */
  allowDismiss?: boolean;
  /**
   * Mode: Public tracking page or root website
   */
  isPublicSite?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function PublicCargoChatBot({
  token,
  receipts = [],
  trackingName,
  hideAfterLoaded = false,
  allowDismiss = true,
  isPublicSite = false,
}: PublicCargoChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [autoHideOnceLoaded, setAutoHideOnceLoaded] = useState(hideAfterLoaded);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if all receipts are loaded into container
  const allCargoLoaded = React.useMemo(() => {
    if (!receipts || receipts.length === 0) return false;
    return receipts.every((r) => {
      const s = (r.status || '').toLowerCase();
      const cont = (r.containerNo || r.container || '').toLowerCase();
      const isDelivered = s.includes('deliver') || s.includes('arrived');
      const isLoadedOrTransit =
        s.includes('transit') ||
        s.includes('loaded') ||
        s.includes('sailing') ||
        (cont && !cont.includes('pending') && !cont.includes('not loaded') && cont !== '-');
      return isDelivered || isLoadedOrTransit;
    });
  }, [receipts]);

  // Check session storage on mount to see if user previously removed the chatbot
  useEffect(() => {
    try {
      const sessionKey = token ? `cargo_bot_removed_${token}` : 'cargo_bot_removed_public';
      const removedPref = sessionStorage.getItem(sessionKey);
      if (removedPref === 'true') {
        setIsRemoved(true);
      }
    } catch (_) {}
  }, [token]);

  // Handle auto-remove after loaded requirement:
  // "after loding remove this cheat bot , also secured data"
  useEffect(() => {
    if (autoHideOnceLoaded && allCargoLoaded && receipts.length > 0) {
      setIsRemoved(true);
    }
  }, [autoHideOnceLoaded, allCargoLoaded, receipts.length]);

  // Initialize welcome message
  useEffect(() => {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let greeting = 'Hello! Ask me anything about your cargo status, packages, or delivery schedule.';

    if (receipts.length > 0) {
      const first = receipts[0];
      greeting = `Hello! Marka: **${trackingName || first.marka || first.party || 'Client'}** (${receipts.length} shipment record${receipts.length > 1 ? 's' : ''}). How can I assist you with your cargo status or ETA?`;
    }

    setMessages([
      {
        id: 'welcome-1',
        role: 'assistant',
        content: greeting,
        timestamp: timeNow,
      },
    ]);
  }, [receipts.length, trackingName]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: timeNow,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Prepare conversation history
      const historyPayload = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          token: token || undefined,
          trackingName: trackingName || undefined,
          contextReceipts: receipts.length > 0 ? receipts : undefined,
        }),
      });

      const data = await res.json();
      const replyText =
        data.reply ||
        'Thank you for your message. Please let me know if you would like me to check your cargo status, cartons, or estimated delivery time.';

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'I am currently experiencing a momentary connectivity delay. Please check your live cargo status table above or ask again in a moment.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Completely remove chatbot from the page (user request: "after loding remove this cheat bot")
  const handlePermanentlyRemoveBot = () => {
    setIsRemoved(true);
    setIsOpen(false);
    try {
      const sessionKey = token ? `cargo_bot_removed_${token}` : 'cargo_bot_removed_public';
      sessionStorage.setItem(sessionKey, 'true');
    } catch (_) {}
  };

  // Restore chatbot if user wants it back
  const handleRestoreBot = () => {
    setIsRemoved(false);
    setIsOpen(true);
    setIsMinimized(false);
    try {
      const sessionKey = token ? `cargo_bot_removed_${token}` : 'cargo_bot_removed_public';
      sessionStorage.removeItem(sessionKey);
    } catch (_) {}
  };

  // Quick Action Buttons
  const quickActions = [
    { label: '📦 Status & ETA', prompt: 'What is the current status and ETA of my cargo?' },
    { label: '❓ Why is cargo late?', prompt: 'Why is my container or cargo delayed, and when will it arrive?' },
    { label: '📋 Items & CTN count', prompt: 'Can you show me the description of goods and carton quantity?' },
    { label: '🔒 Container / BL info', prompt: 'Can you provide the actual container number and BL number?' },
  ];

  // If user removed the chatbot, render a tiny unobtrusive restore pill or nothing
  if (isRemoved) {
    return (
      <div className="fixed bottom-4 right-4 z-40 group">
        <button
          onClick={handleRestoreBot}
          title="Restore AI Cargo Support Chatbot"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-900 text-white text-xs font-semibold rounded-full shadow-lg border border-slate-700/60 backdrop-blur-sm transition-all opacity-40 hover:opacity-100 cursor-pointer"
        >
          <Bot className="w-3.5 h-3.5 text-blue-400" />
          <span>Need Help? Open Chat</span>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Floating Trigger Button (when closed) */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
          {/* Subtle Attention Bubble */}
          <div className="bg-slate-900 text-white text-xs px-3.5 py-1.5 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-1.5 animate-fade-in hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-medium">Cargo Support AI Online</span>
            <button
              onClick={() => setIsRemoved(true)}
              title="Hide Chatbot"
              className="text-slate-400 hover:text-white ml-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="group relative flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-blue-700 via-indigo-600 to-blue-500 hover:from-blue-600 hover:to-indigo-500 text-white rounded-full shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer border-2 border-white/20"
            aria-label="Open Cargo Support Chat"
          >
            <Bot className="w-7 h-7 transition-transform group-hover:scale-110" />
            <span className="absolute top-1 right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900"></span>
            </span>
          </button>
        </div>
      )}

      {/* Main Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 transition-all duration-300 overflow-hidden ${
            isMinimized
              ? 'w-72 h-14'
              : 'w-[92vw] sm:w-[410px] h-[580px] max-h-[85vh]'
          }`}
        >
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-3.5 flex items-center justify-between border-b border-indigo-900/40 select-none">
            <div
              className="flex items-center gap-2.5 cursor-pointer flex-1"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-inner">
                <Bot className="w-5 h-5 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-wide">Cargo Assistant</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-md font-semibold">
                    AI Support
                  </span>
                </div>
                <span className="text-[11px] text-slate-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Logistics Desk
                </span>
              </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-1 text-slate-300">
              {/* Minimize Button */}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand Chat' : 'Minimize'}
                className="p-1.5 hover:bg-white/10 rounded-lg transition cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Remove / Close Button */}
              <button
                onClick={() => {
                  if (allowDismiss) {
                    setShowRemoveConfirm(true);
                  } else {
                    setIsOpen(false);
                  }
                }}
                title="Close / Remove Chatbot"
                className="p-1.5 hover:bg-rose-500/20 hover:text-rose-300 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Remove Chatbot Confirmation Modal Overlay */}
          {showRemoveConfirm && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs z-30 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                <EyeOff className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-white text-base mb-1">Remove Cargo Chatbot?</h4>
              <p className="text-xs text-slate-300 mb-5 leading-relaxed">
                You can close this window for now, or completely remove the assistant from this tracking page.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <button
                  onClick={() => {
                    setShowRemoveConfirm(false);
                    setIsOpen(false);
                  }}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Close Window Only
                </button>
                <button
                  onClick={handlePermanentlyRemoveBot}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Remove Chatbot from Page</span>
                </button>
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer mt-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Body Content (Hidden when minimized) */}
          {!isMinimized && (
            <>
              {/* Security Banner & Auto-hide Indicator */}
              <div className="bg-slate-50 dark:bg-slate-950/60 px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">Privacy Guard: Actual Container &amp; BL are Protected</span>
                </div>
                {allCargoLoaded && (
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                    Loaded
                  </span>
                )}
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/50 dark:bg-slate-900/50 text-sm">
                {messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs text-xs sm:text-[13px] leading-relaxed ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-br-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/60 rounded-bl-xs'
                        }`}
                      >
                        {/* Format line breaks and bold texts cleanly */}
                        <div className="whitespace-pre-wrap space-y-1">
                          {m.content.split('\n').map((line, i) => {
                            // Simple bold parsing e.g. **text**
                            const parts = line.split(/(\*\*.*?\*\*)/g);
                            return (
                              <p key={i}>
                                {parts.map((p, idx) => {
                                  if (p.startsWith('**') && p.endsWith('**')) {
                                    return (
                                      <strong key={idx} className="font-bold">
                                        {p.slice(2, -2)}
                                      </strong>
                                    );
                                  }
                                  return p;
                                })}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">
                        {m.timestamp}
                      </span>
                    </div>
                  );
                })}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex flex-col items-start">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl rounded-bl-xs px-3.5 py-2.5 shadow-xs flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-500 animate-spin" />
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs text-slate-400 ml-1">Checking live cargo data...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Action Suggestion Chips */}
              <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 overflow-x-auto flex items-center gap-1.5 no-scrollbar">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(action.prompt)}
                    disabled={isLoading}
                    className="shrink-0 text-[11px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full font-medium transition border border-slate-200 dark:border-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask about status, items, delays, or ETA..."
                  disabled={isLoading}
                  className="flex-1 bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isLoading}
                  className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md transition disabled:opacity-40 disabled:hover:bg-blue-600 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Bottom Footer Info */}
              <div className="bg-slate-50 dark:bg-slate-950 px-3 py-1 text-[10px] text-center text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span>US International Logistics Support</span>
                <button
                  type="button"
                  onClick={() => setAutoHideOnceLoaded(!autoHideOnceLoaded)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                >
                  {autoHideOnceLoaded ? 'Auto-hide when loaded: ON' : 'Auto-hide when loaded: OFF'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
