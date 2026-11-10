'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface TrackingTokenOption {
  token: string;
  name?: string;
  receipts?: string[];
}

interface SearchableTrackingLinkSelectProps {
  tokens: TrackingTokenOption[];
  selectedToken: string;
  onSelect: (token: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableTrackingLinkSelect({
  tokens,
  selectedToken,
  onSelect,
  placeholder = 'Type link name, marka, receipt #, or token...',
  className = '',
}: SearchableTrackingLinkSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSyncedTokenRef = useRef<string>(selectedToken);

  // Sync internal display when selectedToken changes externally
  useEffect(() => {
    if (selectedToken !== lastSyncedTokenRef.current) {
      lastSyncedTokenRef.current = selectedToken;
      const matched = tokens.find((t) => t.token === selectedToken);
      if (matched) {
        setSearchQuery(matched.name ? `${matched.name} (${matched.token.slice(0, 8)}...)` : matched.token);
      } else {
        setSearchQuery('');
      }
    } else if (selectedToken && !searchQuery) {
      const matched = tokens.find((t) => t.token === selectedToken);
      if (matched) {
        setSearchQuery(matched.name ? `${matched.name} (${matched.token.slice(0, 8)}...)` : matched.token);
      }
    }
  }, [selectedToken, tokens, searchQuery]);

  // Handle outside clicks to close dropdown cleanly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Reset query text to selected token name if valid, avoiding orphan query text
        if (selectedToken) {
          const matched = tokens.find((t) => t.token === selectedToken);
          if (matched) {
            setSearchQuery(matched.name ? `${matched.name} (${matched.token.slice(0, 8)}...)` : matched.token);
          }
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedToken, tokens]);

  // Find currently selected item
  const selectedObj = useMemo(() => {
    return tokens.find((t) => t.token === selectedToken);
  }, [tokens, selectedToken]);

  // Real-time filtering matching:
  // 1. Link Name (e.g. VIP TRADERS, MARKA-786)
  // 2. Token string (e.g. a8b9c0...)
  // 3. Receipt numbers contained in the link (e.g. 1024, 8820)
  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter((t) => {
      const nameMatch = (t.name || '').toLowerCase().includes(q);
      const tokenMatch = (t.token || '').toLowerCase().includes(q);
      const receiptMatch = (t.receipts || []).some((r) =>
        r.toLowerCase().includes(q)
      );
      return nameMatch || tokenMatch || receiptMatch;
    });
  }, [tokens, searchQuery]);

  const handleSelectItem = (item: TrackingTokenOption) => {
    lastSyncedTokenRef.current = item.token;
    onSelect(item.token);
    setSearchQuery(item.name ? `${item.name} (${item.token.slice(0, 8)}...)` : item.token);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    lastSyncedTokenRef.current = '';
    onSelect('');
    setSearchQuery('');
    setIsOpen(true);
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredTokens.length === 0 ? 0 : (prev + 1) % filteredTokens.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredTokens.length === 0 ? 0 : (prev - 1 + filteredTokens.length) % filteredTokens.length
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTokens.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredTokens.length) {
        handleSelectItem(filteredTokens[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative space-y-1.5 ${className}`} ref={containerRef}>
      {/* Type-to-Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={(e) => {
            setIsOpen(true);
            e.currentTarget.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-14 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-slate-900 shadow-xs"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-0.5">
          {(searchQuery || selectedToken) && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear selection to type again"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            title={isOpen ? 'Close list' : 'Show all links'}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Floating Options Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
          {filteredTokens.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-500 italic">
              No matching tracking links found for &quot;{searchQuery}&quot;.
              <div className="text-[10px] text-slate-400 mt-1 not-italic">
                Try searching by a different name, marka, receipt #, or token.
              </div>
            </div>
          ) : (
            filteredTokens.map((t, idx) => {
              const isSelected = selectedToken === t.token;
              const isHighlighted = highlightedIndex === idx;
              return (
                <button
                  key={t.token}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelectItem(t)}
                  className={`w-full text-left px-3 py-2 transition flex items-center justify-between text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 text-blue-900 border-l-4 border-blue-600'
                      : isHighlighted
                      ? 'bg-slate-50 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-1.5 font-bold truncate">
                      <span className="text-blue-700">🏷️</span>
                      <span className="truncate">{t.name || 'Unnamed Link'}</span>
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-normal shrink-0">
                        {t.token.slice(0, 8)}...
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {t.receipts && t.receipts.length > 0 ? (
                        <span>
                          {t.receipts.length} receipt(s): #{t.receipts.slice(0, 4).join(', #')}
                          {t.receipts.length > 4 ? ` +${t.receipts.length - 4} more` : ''}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">0 receipts linked yet (New empty link)</span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Selected Link Pill / Confirmation Banner */}
      {selectedObj ? (
        <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900">
          <div className="flex items-center space-x-1.5 overflow-hidden">
            <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-bold truncate">{selectedObj.name || 'Unnamed Link'}</span>
            <span className="font-mono text-[10px] text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded shrink-0">
              {selectedObj.token.slice(0, 8)}...
            </span>
            <span className="text-[10px] text-blue-600 shrink-0">
              • {selectedObj.receipts?.length || 0} receipt(s)
            </span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-blue-600 hover:text-blue-800 font-bold ml-2 underline shrink-0 cursor-pointer"
          >
            Clear / Type Again
          </button>
        </div>
      ) : (
        <div className="text-[11px] text-amber-600 font-medium">
          Type or select an existing link from the list above.
        </div>
      )}
    </div>
  );
}
