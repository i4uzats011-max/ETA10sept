'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Languages,
  X,
  Copy,
  Check,
  ArrowRightLeft,
  Volume2,
  Sparkles,
  Loader2,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface LiveTranslatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
}

const SAMPLE_TERMS = [
  '3D打印机配件',
  '86寸液晶屏幕',
  'LED汽车大灯',
  '三极管，电磁炉电容，胶带',
  '儿童滑板车，三轮车，玩具车',
  '摩托车铝合金尾箱',
  '水壶盖，油箱盖',
  '厨房拉篮，衣帽间首饰盒',
];

export default function LiveTranslatorModal({
  isOpen,
  onClose,
  initialText = '',
}: LiveTranslatorModalProps) {
  const [inputText, setInputText] = useState(initialText);
  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceLang, setSourceLang] = useState<'zh-CN' | 'en'>('zh-CN');
  const [targetLang, setTargetLang] = useState<'zh-CN' | 'en'>('en');
  const [isCached, setIsCached] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
    }
  }, [initialText]);

  // Live translate function calling /api/translate
  const performTranslation = useCallback(
    async (textToTranslate: string, fromLang: string, toLang: string) => {
      if (!textToTranslate || !textToTranslate.trim()) {
        setTranslatedText('');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToTranslate,
            from: fromLang,
            to: toLang,
          }),
        });

        const data = await response.json();
        if (data.success && typeof data.translated === 'string') {
          setTranslatedText(data.translated);
          setIsCached(Boolean(data.cached));
        } else {
          setTranslatedText(data.error || 'Translation failed');
        }
      } catch (err: any) {
        setTranslatedText(err?.message || 'Network error connecting to translation server');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounced live typing translation (like Google Translate)
  useEffect(() => {
    if (!isOpen) return;

    if (!inputText.trim()) {
      setTranslatedText('');
      setIsLoading(false);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    setIsLoading(true);
    debounceTimer.current = setTimeout(() => {
      performTranslation(inputText, sourceLang, targetLang);
    }, 280);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputText, sourceLang, targetLang, isOpen, performTranslation]);

  // Swap languages
  const handleSwapLanguages = () => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    setSourceLang(newSource);
    setTargetLang(newTarget);
    setInputText(translatedText);
    setTranslatedText(inputText);
  };

  // Copy to clipboard
  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Speak text using browser speech synthesis
  const handleSpeak = (text: string, lang: string) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight flex items-center space-x-2">
                <span>Google Live Translator</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  Real-Time
                </span>
              </h3>
              <p className="text-[11px] text-blue-100 font-medium">
                Live Chinese to English translation engine &bull; Zero database modification
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Selector Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
          <div className="flex items-center space-x-3 w-1/2">
            <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
              {sourceLang === 'zh-CN' ? 'Chinese (Simplified) 中文' : 'English (英语)'}
            </span>
          </div>

          <button
            onClick={handleSwapLanguages}
            className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition flex items-center justify-center border border-slate-200 bg-white shadow-sm"
            title="Swap Languages"
          >
            <ArrowRightLeft className="w-4 h-4 text-slate-700" />
          </button>

          <div className="flex items-center justify-end space-x-3 w-1/2">
            <span className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-800 border border-indigo-200">
              {targetLang === 'en' ? 'English (英语)' : 'Chinese (Simplified) 中文'}
            </span>
          </div>
        </div>

        {/* Translation Body Panels (Google Translate Style) */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 flex-1 overflow-y-auto">
          {/* Left Panel: Source Input */}
          <div className="p-4 flex flex-col justify-between bg-white min-h-[220px]">
            <div className="relative flex-1">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  sourceLang === 'zh-CN'
                    ? '输入中文品名或货物描述 (Type or paste Chinese cargo name)...'
                    : 'Type English text here...'
                }
                rows={6}
                className="w-full h-full p-2 text-base text-slate-900 placeholder:text-slate-400 border-none outline-none resize-none focus:ring-0 leading-relaxed font-normal"
                autoFocus
              />

              {inputText && (
                <button
                  onClick={() => setInputText('')}
                  className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                  title="Clear text"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[11px] text-slate-400 font-medium">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSpeak(inputText, sourceLang)}
                  disabled={!inputText}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40 transition"
                  title="Listen pronunciation"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
              <span>{inputText.length} characters</span>
            </div>
          </div>

          {/* Right Panel: Live Translated Output */}
          <div className="p-4 flex flex-col justify-between bg-slate-50/60 min-h-[220px]">
            <div className="relative flex-1">
              {isLoading ? (
                <div className="flex items-center space-x-2 text-slate-400 text-sm italic py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Translating live via Google Translate...</span>
                </div>
              ) : translatedText ? (
                <div className="text-base font-semibold text-slate-900 leading-relaxed break-words py-1 select-all">
                  {translatedText}
                </div>
              ) : (
                <div className="text-slate-400 text-sm italic py-2">
                  Translation will appear here in real time...
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 text-[11px] text-slate-500 font-medium">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSpeak(translatedText, targetLang)}
                  disabled={!translatedText}
                  className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-600 disabled:opacity-40 transition"
                  title="Listen pronunciation"
                >
                  <Volume2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleCopy}
                  disabled={!translatedText}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                    copied
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'hover:bg-slate-200/70 text-slate-700 disabled:opacity-40'
                  }`}
                  title="Copy English translation"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex items-center space-x-1 text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                <span>{isCached ? 'Instant (Cached)' : 'Live Google Translate'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Sample Items Footer */}
        <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 uppercase shrink-0">Quick Test:</span>
            {SAMPLE_TERMS.slice(0, 5).map((term) => (
              <button
                key={term}
                onClick={() => setInputText(term)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-[11px] font-medium transition shrink-0 border border-slate-200/60"
              >
                {term}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 font-medium shrink-0 flex items-center space-x-1">
            <span>Powered by</span>
            <strong className="text-slate-600">@iamtraction/google-translate</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
