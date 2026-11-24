'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Check, Boxes, ChevronDown, Plus } from 'lucide-react';

export interface SearchableContainerSelectProps {
  containers: Array<{
    container: string;
    containerNumber?: string;
    warehouse?: string;
    loadingDate?: string;
    totalQuantity?: number;
    planStatus?: string;
  }>;
  selectedContainers: string[]; // List of selected container strings
  onChangeContainers: (containers: string[]) => void;
}

export default function SearchableContainerSelect({
  containers,
  selectedContainers,
  onChangeContainers,
}: SearchableContainerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSet = useMemo(() => new Set(selectedContainers), [selectedContainers]);

  // Filtered containers by search term
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return containers;
    const q = searchTerm.toLowerCase().trim();
    return containers.filter((c) => {
      return (
        (c.container || '').toLowerCase().includes(q) ||
        (c.containerNumber || '').toLowerCase().includes(q) ||
        (c.warehouse || '').toLowerCase().includes(q) ||
        (c.loadingDate || '').toLowerCase().includes(q) ||
        (c.planStatus || '').toLowerCase().includes(q)
      );
    });
  }, [containers, searchTerm]);

  const toggleContainer = (containerName: string) => {
    if (selectedSet.has(containerName)) {
      const next = selectedContainers.filter((c) => c !== containerName);
      onChangeContainers(next);
    } else {
      const next = [...selectedContainers, containerName];
      onChangeContainers(next);
    }
    setSearchTerm('');
  };

  const removeContainer = (containerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = selectedContainers.filter((c) => c !== containerName);
    onChangeContainers(next);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeContainers([]);
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-slate-700">
          Select Container(s) / Loading Plan (Multi-Select) *
        </label>
        {selectedContainers.length > 0 && (
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded font-mono">
            {selectedContainers.length} Selected
          </span>
        )}
      </div>

      {/* Main Search Input & Selected Tags Area */}
      <div
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={`w-full min-h-[34px] px-2.5 py-1 bg-slate-50 border rounded-lg text-xs font-semibold flex flex-wrap items-center gap-1 cursor-pointer transition ${
          isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <Boxes className="w-3.5 h-3.5 text-emerald-600 shrink-0 mr-1" />

        {/* Selected Tags */}
        {selectedContainers.map((cName) => (
          <span
            key={cName}
            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[11px] font-bold shadow-2xs"
          >
            <span>{cName}</span>
            <button
              type="button"
              onClick={(e) => removeContainer(cName, e)}
              className="hover:text-rose-600 text-emerald-700"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Search input inside container box */}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={
            selectedContainers.length === 0
              ? 'Type container alias, carrier no., or warehouse...'
              : 'Add more...'
          }
          className="flex-1 min-w-[120px] bg-transparent border-none p-0 text-xs font-semibold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
          onClick={(e) => e.stopPropagation()}
        />

        <div className="flex items-center space-x-1 shrink-0 ml-auto">
          {selectedContainers.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 text-[10px]"
              title="Clear all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* Dropdown Results List */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[320px] max-h-72 overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-300 p-1.5 animate-in fade-in zoom-in-95 duration-100 scrollbar-thin">
          <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100 flex justify-between">
            <span>
              Matching Containers ({filtered.length})
            </span>
            <span className="text-emerald-700 font-bold">Auto-loads on select</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              No container found for &quot;{searchTerm}&quot;
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const isSelected = selectedSet.has(c.container);
                return (
                  <div
                    key={c.container}
                    onClick={() => toggleContainer(c.container)}
                    className={`px-3 py-2 rounded-lg cursor-pointer text-xs flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent onClick
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 pointer-events-none"
                        />
                        <span className="font-mono font-bold text-slate-900">
                          {c.container}
                        </span>
                        {c.containerNumber && (
                          <span className="text-[11px] font-mono text-slate-500">
                            ({c.containerNumber})
                          </span>
                        )}
                        {c.planStatus && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold uppercase">
                            {c.planStatus}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 ml-5.5 flex items-center space-x-2">
                        <span>Wh: {c.warehouse || 'N/A'}</span>
                        <span>•</span>
                        <span>Loading: {c.loadingDate || 'Pending'}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {c.totalQuantity !== undefined && (
                        <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          {c.totalQuantity} CTN
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
