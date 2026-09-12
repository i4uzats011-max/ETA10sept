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


