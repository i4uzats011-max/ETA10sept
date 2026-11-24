'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Sparkles,
} from 'lucide-react';

export interface SalesDatePickerCalendarProps {
  selectedDates: string[]; // List of 'YYYY-MM-DD'
  onChangeDates: (dates: string[]) => void;
  availableDates: string[]; // Dates with entries
  warehouseName?: string;
}

export default function SalesDatePickerCalendar({
  selectedDates,
  onChangeDates,
  availableDates,
  warehouseName,
}: SalesDatePickerCalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set of dates with entries
  const availableSet = useMemo(() => {
    return new Set(availableDates.map((d) => d.trim()));
  }, [availableDates]);

  const selectedSet = useMemo(() => {
    return new Set(selectedDates.map((d) => d.trim()));
  }, [selectedDates]);

  // Initial view year & month
  const initialDate = useMemo(() => {
    if (selectedDates.length > 0) {
      const d = new Date(selectedDates[0]);
      if (!isNaN(d.getTime())) return d;
    }
    if (availableDates.length > 0) {
      const first = new Date(availableDates[0]);
      if (!isNaN(first.getTime())) return first;
    }
    return new Date();
  }, [selectedDates, availableDates]);

  const [currentYear, setCurrentYear] = useState<number>(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(initialDate.getMonth()); // 0-11

  // Close calendar on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      hasEntry: boolean;
      isSelected: boolean;
    }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({
        dateStr: '',
        dayNum: 0,
        isCurrentMonth: false,
        hasEntry: false,
        isSelected: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(currentMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${currentYear}-${mm}-${dd}`;
      const hasEntry = availableSet.has(dateStr);
      const isSelected = selectedSet.has(dateStr);

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        hasEntry,
        isSelected,
      });
    }

    return days;
  }, [currentYear, currentMonth, daysInMonth, firstDayOfWeek, availableSet, selectedSet]);

  const toggleDay = (dateStr: string) => {
    if (!availableSet.has(dateStr)) return; // Only green days with entries
    if (selectedSet.has(dateStr)) {
      onChangeDates(selectedDates.filter((d) => d !== dateStr));
    } else {
      onChangeDates([...selectedDates, dateStr]);
    }
  };

  const removeDate = (dateStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeDates(selectedDates.filter((d) => d !== dateStr));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeDates([]);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold text-slate-700">
          Select Date(s) (Calendar Multi-Select) *
        </label>
        {selectedDates.length > 0 && (
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded font-mono">
            {selectedDates.length} Date(s)
          </span>
        )}
      </div>

      {/* Main Trigger Button with Tags */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[34px] px-2.5 py-1 bg-slate-50 border rounded-lg text-xs font-semibold flex flex-wrap items-center gap-1 cursor-pointer transition ${
          isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mr-1" />

        {selectedDates.length === 0 ? (
          <span className="text-slate-400 font-normal">Click to pick green date(s)...</span>
        ) : (
          selectedDates.map((dStr) => (
            <span
              key={dStr}
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[11px] font-bold shadow-2xs"
            >
              <span>{dStr}</span>
              <button
                type="button"
                onClick={(e) => removeDate(dStr, e)}
                className="hover:text-rose-600 text-emerald-700"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}

        <div className="flex items-center space-x-1 shrink-0 ml-auto">
          {selectedDates.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 text-[10px]"
              title="Clear all dates"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <span className="text-[10px] text-slate-400">📅</span>
        </div>
      </div>

      {/* Popover Calendar */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-300 p-3.5 animate-in fade-in zoom-in-95 duration-100">
          {/* Header Navigation */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="font-bold text-xs text-slate-900 tracking-wide">
              {monthNames[currentMonth]} {currentYear}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calendarDays.map((day, idx) => {
              if (!day.isCurrentMonth) {
                return <div key={idx} className="h-8" />;
              }

              // Color Logic:
              // GREEN: Date has entry in warehouse
              // GRAY: Date has NO entry
              if (day.hasEntry) {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(day.dateStr)}
                    className={`h-8 rounded-lg font-bold transition flex items-center justify-center relative ${
                      day.isSelected
                        ? 'bg-emerald-800 text-white ring-2 ring-emerald-950 shadow-md scale-105'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-xs cursor-pointer'
                    }`}
                    title={`Date ${day.dateStr} has cargo receipts! Click to toggle selection.`}
                  >
                    <span>{day.dayNum}</span>
                    {day.isSelected ? (
                      <Check className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-white stroke-[3]" />
                    ) : (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white opacity-80" />
                    )}
                  </button>
                );
              }

              // Gray (No entry)
              return (
                <div
                  key={idx}
                  className="h-8 rounded-lg font-medium text-slate-400 bg-slate-50 flex items-center justify-center cursor-not-allowed select-none"
                  title="No entries on this date"
                >
                  <span>{day.dayNum}</span>
                </div>
              );
            })}
          </div>

          {/* Legend Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-600">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 shrink-0 inline-block" />
              <span className="font-semibold text-emerald-800">
                Green = Entry Available
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-slate-200 shrink-0 inline-block" />
              <span className="text-slate-500">Gray = No Entry</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
