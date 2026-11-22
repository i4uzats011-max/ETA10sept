'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Sparkles,
  Phone,
  User,
  Shield,
  Briefcase,
  Trash2,
  Edit3,
} from 'lucide-react';

export interface SalesWhatsAppChatProps {
  isOpen: boolean;
  onClose: () => void;
  receiptNo?: string;
  containerNo?: string;
  partnerUsername?: string;
  partnerName?: string;
  currentUser: {
    username: string;
    role: string;
    name?: string;
  };
}

export default function SalesWhatsAppChat({
  isOpen,
  onClose,
  receiptNo,
  containerNo,
  partnerUsername,
  partnerName,
  currentUser,
}: SalesWhatsAppChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const QUICK_CHIPS = [
    'Rate Finalized ✅',
    'Party Asking for Discount 💬',
    'Please Check Actual CBM ⚠️',
    'Cargo on Hold 🛑',
    'Ready / Available to Deliver 🚚',
    'Payment Cleared 💰',
    'Loading Date Confirmed 📅',
  ];

  const fetchMessages = async () => {
    try {
      let url = '/api/sales/messages';
      if (receiptNo) {
        url += `?receiptNo=${encodeURIComponent(receiptNo)}`;
      } else if (partnerUsername) {
        url += `?partner=${encodeURIComponent(partnerUsername)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (e) {
      console.error('Failed to fetch messages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchMessages();

    // Poll every 4 seconds for real-time two-way communication
    const interval = setInterval(fetchMessages, 4000);
    return () => clearInterval(interval);
  }, [isOpen, receiptNo, partnerUsername]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/sales/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptNo: receiptNo || '',
          container: containerNo || '',
          message: text,
          recipientUsername: partnerUsername || 'all',
          type: 'text',
        }),
      });

      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) => [...prev, data.message]);
        if (!textToSend) setInputText('');
      }
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  };

  const handleStartEdit = (msg: any) => {
    setEditingMessageId(msg._id);
    setEditingText(msg.message);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingText.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/sales/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingMessageId, message: editingText.trim() }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m._id === editingMessageId ? { ...m, ...data.message } : m))
        );
        setEditingMessageId(null);
        setEditingText('');
      } else {
        alert(data.error || 'Failed to edit message');
      }
    } catch (e: any) {
      alert(e?.message || 'Error updating message');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Are you sure you want to delete this message? (Allowed within 24 hours of sending)')) return;
    try {
      const res = await fetch(`/api/sales/messages?id=${encodeURIComponent(msgId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m._id === msgId ? { ...m, ...data.message } : m))
        );
      } else {
        alert(data.error || 'Failed to delete message');
      }
    } catch (e: any) {
      alert(e?.message || 'Error deleting message');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg h-full sm:h-[94vh] sm:mr-4 sm:rounded-2xl flex flex-col bg-[#efeae2] shadow-2xl overflow-hidden border border-slate-300">
        {/* WhatsApp Top Green Header */}
        <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shadow-md select-none">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold border border-white/30 text-base">
              {partnerName ? partnerName.charAt(0).toUpperCase() : receiptNo ? '📦' : '👥'}
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center space-x-1.5">
                <span>{partnerName || (receiptNo ? `Receipt #${receiptNo}` : 'Sales Team Broadcast')}</span>
                {containerNo && (
                  <span className="text-[10px] bg-[#128C7E] px-1.5 py-0.5 rounded text-white font-mono">
                    {containerNo}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-200 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Two-Way Live Portal Chat</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition"
              title="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-[#e7fedc] px-3 py-1.5 border-b border-emerald-200 flex items-center justify-between text-[11px] text-emerald-900">
          <span className="font-medium">
            💬 Connected as: <strong className="text-emerald-950">{currentUser.name || currentUser.username}</strong> ({currentUser.role === 'sales_head' ? 'Sales Head' : currentUser.role})
          </span>
          {receiptNo && <span className="font-mono text-emerald-800">Thread: {receiptNo}</span>}
        </div>

        {/* Chat Messages Body */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{
            backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        >
          {loading && messages.length === 0 ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#075E54]"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="inline-flex p-3 rounded-full bg-white shadow-sm mb-3">
                <MessageSquare className="w-8 h-8 text-[#075E54]" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">No messages yet</h4>
              <p className="text-xs text-slate-600 mt-1">
                Start the two-way conversation between Sales Head and Sales Team regarding rates, remarks, or cargo verification.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.senderUsername === currentUser.username;
              const isDiscrepancy = msg.type === 'discrepancy';
              const isDeleted = Boolean(msg.isDeleted);
              const msgAgeMs = Date.now() - new Date(msg.createdAt).getTime();
              const canDelete = (isMe || ['sales_head', 'admin'].includes(currentUser.role)) && msgAgeMs <= 24 * 60 * 60 * 1000;
              const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg._id || idx}
                  className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm relative text-xs ${
                      isDeleted
                        ? 'bg-slate-100 text-slate-500 italic border border-slate-200'
                        : isDiscrepancy
                        ? 'bg-amber-100 border border-amber-300 text-amber-950'
                        : isMe
                        ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none'
                        : 'bg-white text-slate-900 rounded-tl-none border border-slate-200'
                    }`}
                  >
                    {/* Sender Label */}
                    {!isMe && (
                      <div className="text-[10px] font-bold text-[#075E54] mb-0.5 flex items-center space-x-1">
                        <span>{msg.senderName || msg.senderUsername}</span>
                        <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded uppercase">
                          {msg.senderRole}
                        </span>
                      </div>
                    )}

                    {/* Message Text */}
                    {isDeleted ? (
                      <div className="flex items-center space-x-1.5 py-0.5 text-[11px] text-slate-500 font-sans not-italic">
                        <span className="text-xs">🚫</span>
                        <span className="italic">{msg.message}</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words leading-relaxed text-[12px]">
                        {msg.message}
                        {msg.isEdited && !isDeleted && (
                          <span className="text-[9px] text-slate-400 font-normal italic ml-1.5 select-none">
                            (Edited)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Timestamp & Action Row */}
                    <div className="flex items-center justify-end space-x-1.5 mt-1 text-[10px] text-slate-500">
                      <span>{timeStr}</span>
                      {isMe && !isDeleted && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                      {canDelete && !isDeleted && (
                        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button
                            onClick={() => handleStartEdit(msg)}
                            title="Edit message (Allowed within 24 hours)"
                            className="p-0.5 hover:text-emerald-600"
                          >
                            <Edit3 className="w-3 h-3 text-slate-400 hover:text-emerald-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg._id)}
                            title="Delete message (Allowed within 24 hours)"
                            className="p-0.5 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="bg-[#f0f2f5] px-3 py-2 border-t border-slate-200 overflow-x-auto flex items-center space-x-1.5 scrollbar-thin">
          {QUICK_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              className="text-[11px] whitespace-nowrap bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 px-2.5 py-1 rounded-full shadow-xs transition"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Edit Message Banner */}
        {editingMessageId && (
          <div className="bg-emerald-50 px-3.5 py-1.5 border-t border-emerald-200 flex items-center justify-between text-xs text-emerald-900 shadow-inner">
            <div className="flex items-center space-x-1.5">
              <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-bold text-[11px]">संदेश एडिट करें (Editing Message)</span>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold"
            >
              रद्द करें (Cancel)
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="bg-[#f0f2f5] p-3 border-t border-slate-300 flex items-center space-x-2">
          <input
            type="text"
            value={editingMessageId ? editingText : inputText}
            onChange={(e) => editingMessageId ? setEditingText(e.target.value) : setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (editingMessageId) {
                  handleSaveEdit();
                } else {
                  handleSendMessage();
                }
              }
            }}
            placeholder={editingMessageId ? "Edit message content..." : "Type a message (WhatsApp style)..."}
            className="flex-1 bg-white border border-slate-300 rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#075E54] focus:border-transparent text-slate-800"
          />
          <button
            onClick={() => editingMessageId ? handleSaveEdit() : handleSendMessage()}
            disabled={editingMessageId ? (!editingText.trim() || savingEdit) : (!inputText.trim() || sending)}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition ${
              (editingMessageId ? (editingText.trim() && !savingEdit) : (inputText.trim() && !sending))
                ? 'bg-[#075E54] hover:bg-[#128C7E] shadow'
                : 'bg-slate-400 cursor-not-allowed'
            }`}
            title={editingMessageId ? "Save Edit" : "Send"}
          >
            {editingMessageId ? (
              <Check className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
