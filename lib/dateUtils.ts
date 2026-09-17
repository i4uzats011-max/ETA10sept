/**
 * Date Utilities for Cargo Tracking
 * Parses receipt date (stored in `date` field in DB) in various formats (DD-MM-YY, DD/MM/YYYY, etc.)
 * Computes turnaround / days to deliver between Receipt Date and ETA.
 */

export function parseReceiptDate(dateStr?: string | number | null): Date | null {
  if (dateStr === null || dateStr === undefined) return null;
  const s = String(dateStr).trim();
  if (!s || s === "N/A") return null;

  // Format: Excel serial number (e.g. 45754)
  if (/^\d{5}$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    const num = Number(s);
    const d = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  // Format: (Ddd, )DD-MMM-YY or (Ddd, )DD-MMM-YYYY (e.g. Sat, 12-Sep-26 or 12-Sep-26)
  const dMmmYMatch = s.match(/^(?:[A-Za-z]{3},\s*)?(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (dMmmYMatch) {
    const day = parseInt(dMmmYMatch[1], 10);
    const mStr = dMmmYMatch[2].toLowerCase();
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = monthNames.indexOf(mStr);
    if (month !== -1) {
      let year = parseInt(dMmmYMatch[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Format: (Ddd, )DD-MM-YY or DD-MM-YYYY or DD/MM/YY or DD/MM/YYYY (e.g. Sat, 12-09-26 or 12-09-26)
  const dmyMatch = s.match(/^(?:[A-Za-z]{3},\s*)?(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  // Format: YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateDaysToDeliver(
  dateStr?: string | null,
  etaStr?: string | null,
  uploadedAt?: string | Date | null
): number | null {
  const receiptDate = parseReceiptDate(dateStr) || (uploadedAt ? new Date(uploadedAt) : null);
  if (!receiptDate || !etaStr || etaStr === "N/A") return null;

  const etaDate = new Date(etaStr);
  if (isNaN(etaDate.getTime())) return null;

  return Math.ceil((etaDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatReceiptDate(dateStr?: string | null): string {
  const parsed = parseReceiptDate(dateStr);
  if (!parsed) return dateStr || "N/A";
  return parsed.toISOString().slice(0, 10);
}

/**
 * Global Date Formatter: Ddd, Dd-mm-yy (e.g. 'Wed, 09-09-26' / 'Sun, 30-08-26')
 * Parses any date format (ISO, DD-MM-YY, DD/MM/YYYY, Excel serials) and outputs
 * standardized 3-letter day abbreviation followed by DD-MM-YY.
 */
export function formatGlobalDate(dateInput?: string | number | Date | null): string {
  if (dateInput === null || dateInput === undefined) return '—';
  const strVal = String(dateInput).trim();
  if (!strVal || strVal === 'N/A' || strVal === 'Pending' || strVal === '—') {
    return strVal || '—';
  }

  // If already formatted like 'Sat, 12-09-26', return directly to avoid re-parsing overhead and edge cases
  if (/^[A-Za-z]{3},\s*\d{2}-\d{2}-\d{2}$/.test(strVal)) {
    return strVal;
  }

  let d: Date | null = null;
  if (dateInput instanceof Date) {
    d = isNaN(dateInput.getTime()) ? null : dateInput;
  } else {
    d = parseReceiptDate(dateInput);
  }

  if (!d) return strVal;

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = daysOfWeek[d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);

  return `${dayName}, ${dd}-${mm}-${yy}`;
}

/**
 * Calculates elapsed days between two date strings (e.g. loading departure date to delivery date)
 */
export function calculateDaysBetween(
  startDateStr?: string | null,
  endDateStr?: string | null
): number | null {
  const start = parseReceiptDate(startDateStr);
  const end = parseReceiptDate(endDateStr);
  if (!start || !end) return null;

  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function isContainerLate(
  dateStr?: string | null,
  etaStr?: string | null,
  uploadedAt?: string | Date | null
): boolean {
  const receiptDate = parseReceiptDate(dateStr) || (uploadedAt ? new Date(uploadedAt) : null);
  if (!receiptDate) return false;

  // 1. If ETA is set, check if turnaround from receipt date to ETA exceeds 35 days
  if (etaStr && etaStr !== "N/A") {
    const etaDate = new Date(etaStr);
    if (!isNaN(etaDate.getTime())) {
      const turnaroundDays = Math.ceil((etaDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
      if (turnaroundDays > 35) return true;
    }
  }

  // 2. Elapsed days from receipt date to today exceeds 35 days
  const elapsedFromReceipt = Math.ceil((Date.now() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
  return elapsedFromReceipt > 35;
}

export function getDeliveryTurnaroundStatus(
  dateStr?: string | null,
  etaStr?: string | null,
  uploadedAt?: string | Date | null
): {
  days: number | null;
  isLate: boolean;
  daysOverLimit: number;
  label: string;
  badgeClass: string;
} {
  const receiptDate = parseReceiptDate(dateStr) || (uploadedAt ? new Date(uploadedAt) : null);
  if (!receiptDate) {
    return {
      days: null,
      isLate: false,
      daysOverLimit: 0,
      label: "No Receipt Date",
      badgeClass: "bg-gray-100 text-gray-600 border-gray-200",
    };
  }

  const elapsedFromReceipt = Math.ceil((Date.now() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));

  if (etaStr && etaStr !== "N/A") {
    const etaDate = new Date(etaStr);
    if (!isNaN(etaDate.getTime())) {
      const etaDays = Math.ceil((etaDate.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
      const isLate = etaDays > 35 || elapsedFromReceipt > 35;
      const effectiveDays = Math.max(etaDays, elapsedFromReceipt);
      const daysOverLimit = effectiveDays > 35 ? effectiveDays - 35 : 0;
      return {
        days: etaDays,
        isLate,
        daysOverLimit,
        label: isLate ? `${etaDays}d (Late +${daysOverLimit}d)` : `${etaDays}d (On Time)`,
        badgeClass: isLate
          ? "bg-red-100 text-red-800 border-red-300 font-black"
          : "bg-emerald-50 text-emerald-800 border-emerald-200 font-bold",
      };
    }
  }

  const isLate = elapsedFromReceipt > 35;
  const daysOverLimit = isLate ? elapsedFromReceipt - 35 : 0;
  return {
    days: elapsedFromReceipt,
    isLate,
    daysOverLimit,
    label: isLate ? `${elapsedFromReceipt}d from Receipt (+${daysOverLimit}d)` : `${elapsedFromReceipt}d from Receipt (Pending ETA)`,
    badgeClass: isLate ? "bg-red-100 text-red-800 border-red-200 font-bold" : "bg-gray-100 text-gray-700 border-gray-200",
  };
}

/**
 * Calculates public estimated delivery date: ETA + days (default +10 days).
 * Used for public tracking where users can only see the date of delivery (ETA + 10 days by default, or admin altered).
 */
export function calculatePublicDeliveryDate(
  etaInput?: string | number | Date | null,
  daysToAdd: number = 10
): string {
  if (!etaInput) return 'Pending';
  const str = String(etaInput).trim();
  if (!str || str === 'N/A' || str === 'Pending' || str === '—') return 'Pending';

  const d = parseReceiptDate(str) || new Date(str);
  if (!d || isNaN(d.getTime())) return 'Pending';

  const deliveryDate = new Date(d.getTime());
  const offset = typeof daysToAdd === 'number' && !isNaN(daysToAdd) ? daysToAdd : 10;
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + offset);
  return formatGlobalDate(deliveryDate);
}

export interface FlexibleDateResult {
  iso: string;          // 'YYYY-MM-DD'
  display: string;      // 'Wed, 12-10-26'
  fullDisplay: string;  // 'Wednesday, 12-Oct-2026'
  dayName: string;      // 'Wednesday'
  date: Date;
  rawMatched: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Universal Date Parser for Copy-Paste:
 * Accepts ANY format (emails, WhatsApp, carrier tracking snippets, raw dates).
 * Extracts, validates, and normalizes into YYYY-MM-DD + human readable formats.
 */
export function parseFlexibleDate(input?: string | number | null): FlexibleDateResult | null {
  if (input === null || input === undefined) return null;
  const rawStr = String(input).trim();
  if (!rawStr || rawStr === 'N/A' || rawStr === 'Pending' || rawStr === '—') return null;

  // 1. Excel Serial number
  if (/^\d{5}$/.test(rawStr) && Number(rawStr) > 20000 && Number(rawStr) < 80000) {
    const num = Number(rawStr);
    const d = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      return buildDateResult(d, rawStr);
    }
  }

  // Remove common prefix noise e.g. "ETA:", "Arrival:", "Date:", "Discharge:", "Estimated Arrival:"
  const cleaned = rawStr.replace(/^(?:(?:estimated\s+)?(?:eta|arrival|discharge|destination|departure|loading|date)\s*[:=\-]\s*)/i, '').trim();

  // 2. Pattern: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (e.g. 2026-10-12, 2026/10/12, 2026.10.12)
  const ymd = cleaned.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime()) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return buildDateResult(d, ymd[0]);
    }
  }

  // 3. Pattern: DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (e.g. 12-Oct-2026, 12 Oct 2026, 12-Oct-26, 12th October 2026)
  const dMmmY = cleaned.match(/\b(\d{1,2})(?:st|nd|rd|th)?[-/\s,]+([A-Za-z]{3,9})[-/\s,]+(\d{2,4})\b/i);
  if (dMmmY) {
    const day = parseInt(dMmmY[1], 10);
    const mKey = dMmmY[2].toLowerCase();
    const month = MONTH_MAP[mKey] ?? MONTH_MAP[mKey.slice(0, 3)];
    if (month !== undefined) {
      let year = parseInt(dMmmY[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) {
        return buildDateResult(d, dMmmY[0]);
      }
    }
  }

  // 4. Pattern: MMM DD, YYYY or Month DD, YYYY (e.g. Oct 12, 2026 or October 12, 2026)
  const mmmDY = cleaned.match(/\b([A-Za-z]{3,9})[-/\s,]+(\d{1,2})(?:st|nd|rd|th)?(?:[-/\s,]+(\d{2,4}))?\b/i);
  if (mmmDY) {
    const mKey = mmmDY[1].toLowerCase();
    const month = MONTH_MAP[mKey] ?? MONTH_MAP[mKey.slice(0, 3)];
    if (month !== undefined) {
      const day = parseInt(mmmDY[2], 10);
      let year = mmmDY[3] ? parseInt(mmmDY[3], 10) : new Date().getUTCFullYear();
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, month, day));
      if (!isNaN(d.getTime())) {
        return buildDateResult(d, mmmDY[0]);
      }
    }
  }

  // 5. Pattern: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY (Standard Indian/UK logistics date)
  const dmy = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) {
    const part1 = parseInt(dmy[1], 10);
    const part2 = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;

    // Logic: In Indian/Chinese shipping logistics, DD-MM-YYYY is standard.
    // If part1 > 12, it must be day. If part2 > 12 and part1 <= 12, part2 is day (US format fallback).
    let day = part1;
    let month = part2 - 1;
    if (part1 <= 12 && part2 > 12) {
      day = part2;
      month = part1 - 1;
    }

    const d = new Date(Date.UTC(year, month, day));
    if (!isNaN(d.getTime()) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return buildDateResult(d, dmy[0]);
    }
  }

  // 6. Generic JS Date fallback
  const fallback = new Date(cleaned);
  if (!isNaN(fallback.getTime())) {
    return buildDateResult(fallback, cleaned);
  }

  return null;
}

function buildDateResult(d: Date, rawMatched: string): FlexibleDateResult {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;
  const dayName = FULL_DAY_NAMES[d.getUTCDay()];
  const mmm = SHORT_MONTH_NAMES[d.getUTCMonth()];
  const yy = String(yyyy).slice(-2);

  return {
    iso,
    display: `${dayName.slice(0, 3)}, ${dd}-${mm}-${yy}`,
    fullDisplay: `${dayName}, ${dd}-${mmm}-${yyyy}`,
    dayName,
    date: d,
    rawMatched,
  };
}

export type EtaBucketType =
  | 'within-2-days'
  | '2-to-7-days'
  | '7-to-15-days'
  | 'more-than-15-days'
  | 'late'
  | 'delivered'
  | 'pending';

/**
 * Categorizes a container into ETA Buckets:
 * 1. Within 2 Days / Today: 0 to 2 days remaining (Urgent arrival)
 * 2. 2 to 7 Days: 2 to 7 days remaining (This week)
 * 3. 7 to 15 Days: 7 to 15 days remaining (Next week / Fortnight)
 * 4. More Than 15 Days: > 15 days remaining (In transit long haul)
 * 5. Late / Overdue: ETA passed (< 0 days) and not marked delivered
 */
export function getEtaBucket(daysRemaining: number | null | undefined, isDelivered?: boolean): EtaBucketType {
  if (isDelivered) return 'delivered';
  if (daysRemaining === null || daysRemaining === undefined) return 'pending';
  if (daysRemaining < 0) return 'late';
  if (daysRemaining <= 2) return 'within-2-days';
  if (daysRemaining <= 7) return '2-to-7-days';
  if (daysRemaining <= 15) return '7-to-15-days';
  return 'more-than-15-days';
}



