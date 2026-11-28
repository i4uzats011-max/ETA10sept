/**
 * China Warehouse Client (https://zg.kuaisongkj.com)
 * Handles automated session login, querying, and paginated data extraction
 * for GZ (RS-21), YW (AS-14), and YW-55 (YW-55) warehouses.
 */

import { CONFIG } from '@/lib/config';

export type ChinaWarehouseKey = 'GZ' | 'YW' | 'YW-55' | string;

export interface ChinaWarehouseRecord {
  id: string; // China portal record ID
  warehouse: string;
  entryCode: string; // "RS-21", "AS-14", "YW-55"
  code: string; // Unique Receipt / Waybill number (e.g. "261121020")
  date: string; // Full date string (e.g. "2026-11-21 13:02:28")
  formattedDate: string; // "YYYY-MM-DD"
  commodity: string; // Chinese commodity description
  packaging: string; // Packaging description
  mark: string; // Main shipping mark (唛头)
  actualQuantity: number; // Inward cartons/packages
  weight: string; // Weight in kg
  volume: string; // Volume in m³
  stockState: number; // 0 = In Stock (库存中), 1 = Out of Stock (已出库)
  shipQuantity: number;
  shipWeight: number;
  shipVolume: number;
  customerName: string;
  driver: string;
  phone: string;
  plate: string;
  remark: string;
  bandanFee: number;
  packagingFee: number;
  advanceAmount: number;
  networkName: string;
}

export function toCanonicalWarehouse(wh: string): string {
  const clean = (wh || '').trim().toUpperCase();
  const norm = clean.replace(/[^A-Z0-9]/g, '');
  if (clean === 'RS-21' || clean === 'GZ' || clean === 'GUANGZHOU' || norm === 'RS21' || norm === 'GZ') return 'RS-21';
  if (clean === 'AS-14' || clean === 'YW' || clean === 'YIWU' || norm === 'AS14' || norm === 'YW') return 'AS-14';
  if (clean === 'YW-55' || clean === 'YW55' || norm === 'YW55') return 'YW-55';
  return wh || 'RS-21';
}

export function getWarehouseCreds(wh: string): { UID: string; PASSWORD: string; CODE: string } {
  const clean = wh.trim();
  const upper = clean.toUpperCase();
  const normalized = upper.replace(/[^A-Z0-9]/g, '');

  if (upper === 'RS-21' || upper === 'GZ' || upper === 'GUANGZHOU' || normalized === 'RS21' || normalized === 'GZ') {
    return { ...CONFIG.CHINA_WH.GZ, CODE: 'RS-21' };
  }
  if (upper === 'AS-14' || upper === 'YW' || upper === 'YIWU' || normalized === 'AS14' || normalized === 'YW') {
    return { ...CONFIG.CHINA_WH.YW, CODE: 'AS-14' };
  }
  if (upper === 'YW-55' || upper === 'YW55' || normalized === 'YW55') {
    return { ...((CONFIG.CHINA_WH as any).YW55 || (CONFIG.CHINA_WH as any)['YW-55']), CODE: 'YW-55' };
  }
  if ((CONFIG.CHINA_WH as any)[clean]) {
    return (CONFIG.CHINA_WH as any)[clean];
  }
  if ((CONFIG.CHINA_WH as any)[upper]) {
    return (CONFIG.CHINA_WH as any)[upper];
  }
  throw new Error(`No credentials configured for China warehouse: ${wh}`);
}

async function fetchWithRetry(url: string, init: RequestInit, retries: number = 3, timeoutMs: number = 30000): Promise<Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastError;
}

export class ChinaWarehouseClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const raw = baseUrl || CONFIG.CHINA_WH.BASE_URL;
    // Strip trailing /s or slashes to ensure consistent query/search endpoints
    this.baseUrl = raw.replace(/\/s\/?$/i, '').replace(/\/+$/, '');
  }

  /**
   * Authenticate with China portal and obtain session cookie
   */
  async login(wh: ChinaWarehouseKey): Promise<string> {
    const creds = getWarehouseCreds(wh);
    const loginUrl = `${this.baseUrl}/query`;

    const params = new URLSearchParams({
      code: creds.UID,
      password: creds.PASSWORD,
      language: 'zh_CN',
    });

    const res = await fetchWithRetry(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: params.toString(),
    }, 3, 25000);

    if (!res.ok) {
      throw new Error(`Login failed for warehouse ${wh}: HTTP status ${res.status}`);
    }

    const setCookie = res.headers.get('set-cookie');
    const data = await res.json().catch(() => null);

    if (!data || data.code !== 200) {
      throw new Error(
        `Login rejected by China portal for warehouse ${wh} (${creds.UID}): ${data?.msg || 'Unknown error'}`
      );
    }

    // Extract JSESSIONID cookie
    if (!setCookie) {
      throw new Error(`No Set-Cookie returned for warehouse ${wh}`);
    }

    const match = setCookie.match(/JSESSIONID=[^;]+/i);
    const sessionCookie = match ? match[0] : setCookie.split(';')[0];
    return sessionCookie;
  }

  /**
   * Fetch a single paginated batch of records
   */
  async fetchBatch(
    wh: ChinaWarehouseKey,
    cookie: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      stockState?: string;
      code?: string;
    } = {}
  ): Promise<{ count: number; records: ChinaWarehouseRecord[] }> {
    const searchUrl = `${this.baseUrl}/search`;
    const searchParams = new URLSearchParams({
      page: String(options.page || 1),
      limit: String(options.limit || 200),
      stockState: options.stockState !== undefined ? options.stockState : '',
      startDate: options.startDate || '',
      endDate: options.endDate || '',
      code: options.code || '',
    });

    const res = await fetchWithRetry(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: searchParams.toString(),
    }, 3, 30000);

    if (!res.ok) {
      throw new Error(`Search failed for ${wh}: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.code !== 200 || !Array.isArray(data.data)) {
      throw new Error(`Invalid response from /search for ${wh}: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const defaultEntryCode =
      wh === 'GZ' || wh === 'RS-21' ? 'RS-21' : (wh === 'YW-55' || wh === 'YW55') ? 'YW-55' : 'AS-14';

    const records: ChinaWarehouseRecord[] = data.data.map((row: any) => {
      const rawDate = String(row.date || '').trim();
      let formattedDate = '';
      if (rawDate) {
        formattedDate = rawDate.slice(0, 10);
      }

      return {
        id: String(row.id || ''),
        warehouse: wh,
        entryCode: String(row.entryCode || defaultEntryCode).trim(),
        code: String(row.code || '').trim(),
        date: rawDate,
        formattedDate: formattedDate || new Date().toISOString().slice(0, 10),
        commodity: String(row.commodity || '').trim(),
        packaging: String(row.packaging || '').trim(),
        mark: String(row.mark || '').trim(),
        actualQuantity: parseInt(String(row.actualQuantity || 0), 10) || 0,
        weight: String(row.weight || '').trim(),
        volume: String(row.volume || '').trim(),
        stockState: typeof row.stockState === 'number' ? row.stockState : parseInt(String(row.stockState || 0), 10) || 0,
        shipQuantity: parseFloat(String(row.shipQuantity || 0)) || 0,
        shipWeight: parseFloat(String(row.shipWeight || 0)) || 0,
        shipVolume: parseFloat(String(row.shipVolume || 0)) || 0,
        customerName: String(row.customerName || '').trim(),
        driver: String(row.driver || '').trim(),
        phone: String(row.phone || '').trim(),
        plate: String(row.plate || '').trim(),
        remark: String(row.remark || '').trim(),
        bandanFee: parseFloat(String(row.bandanFee || 0)) || 0,
        packagingFee: parseFloat(String(row.packagingFee || 0)) || 0,
        advanceAmount: parseFloat(String(row.advanceAmount || 0)) || 0,
        networkName: String(row.networkName || '').trim(),
      };
    });

    return {
      count: typeof data.count === 'number' ? data.count : records.length,
      records,
    };
  }

  /**
   * Fetch all records matching criteria across all pages (with pagination)
   */
  async fetchAllRecords(
    wh: ChinaWarehouseKey,
    options: {
      startDate?: string;
      endDate?: string;
      stockState?: string;
      maxPages?: number;
      limitPerPage?: number;
      receiptCode?: string;
    } = {}
  ): Promise<ChinaWarehouseRecord[]> {
    const cookie = await this.login(wh);
    const limit = options.limitPerPage || 200;
    const maxPages = options.maxPages || 20;

    let allRecords: ChinaWarehouseRecord[] = [];
    let page = 1;

    while (page <= maxPages) {
      const { count, records } = await this.fetchBatch(wh, cookie, {
        page,
        limit,
        startDate: options.startDate,
        endDate: options.endDate,
        stockState: options.stockState,
        code: options.receiptCode,
      });

      if (records.length === 0) break;
      allRecords = allRecords.concat(records);

      if (allRecords.length >= count || records.length < limit) {
        break;
      }
      page++;
    }

    return allRecords;
  }
}

/**
 * Helper to get date strings for periods (e.g. today, last 24h, 7 days, 30 days)
 */
export function getDateRange(daysBack: number = 1): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const format = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    startDate: format(start),
    endDate: format(end),
  };
}
