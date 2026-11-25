/**
 * China Warehouse Auto-Sync CLI Engine
 * 
 * Usage:
 *   node scripts/sync_china_warehouse.js               (Regular sync: recent 3 days)
 *   node scripts/sync_china_warehouse.js --verify      (Daily 10 AM 24h verification)
 *   node scripts/sync_china_warehouse.js --sunday      (Sunday weekly audit)
 *   node scripts/sync_china_warehouse.js --month       (Monthly 30-day full audit)
 *   node scripts/sync_china_warehouse.js --wh=GZ       (Only GZ warehouse)
 *   node scripts/sync_china_warehouse.js --wh=YW       (Only YW warehouse)
 *   node scripts/sync_china_warehouse.js --daemon      (Run scheduled cron daemon)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Read environment variables from .env or .env.local if present
function loadEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).replace(/^['"]|['"]$/g, '').trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'cargo_tracker_v2';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  Buffer.from('QVEuQWI4Uk42SlNMeGFWZEhHaXE2LXl6c3Z0bGR5cDQ2TVp2WkVYMmRuV1l3d1FLOUg5cVE=', 'base64').toString('utf-8');

const BASE_URL = process.env.CHINA_WH_BASE_URL || 'https://zg.kuaisongkj.com';
const GZ_UID = process.env.CHINA_WH_GZ_UID || 'RS-21';
const GZ_PWD = process.env.CHINA_WH_GZ_PWD || '123456';
const YW_UID = process.env.CHINA_WH_YW_UID || 'AS-14';
const YW_PWD = process.env.CHINA_WH_YW_PWD || '940426';
const YW55_UID = process.env.CHINA_WH_YW55_UID || 'YW-55';
const YW55_PWD = process.env.CHINA_WH_YW55_PWD || '157243';

// Packaging standard translation map
const PKG_MAP = {
  '木架': 'Wooden frame',
  '木箱': 'Wooden box',
  '纸箱': 'Carton',
  '编织袋': 'Woven bag',
  '托盘': 'Pallet',
  '铁框': 'Iron cage',
  '胶袋': 'Plastic bag',
};

// Chinese text detector
function hasChinese(str) {
  return /[\u4e00-\u9fa5]/.test(String(str || ''));
}

// In-memory cache for translations
const transCache = new Map();

// Gemini Batch Translator
async function translateWithGemini(texts) {
  const result = {};
  const toFetch = [];

  for (const raw of texts) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (!hasChinese(t)) {
      result[t] = t;
      continue;
    }
    if (transCache.has(t)) {
      result[t] = transCache.get(t);
      continue;
    }
    if (PKG_MAP[t]) {
      result[t] = PKG_MAP[t];
      transCache.set(t, PKG_MAP[t]);
      continue;
    }
    toFetch.push(t);
  }

  const uniqueToFetch = Array.from(new Set(toFetch));
  if (uniqueToFetch.length === 0) return result;

  try {
    const prompt = `Translate Chinese cargo/commodity/packaging terms to clean, concise English item names.
Return ONLY valid JSON mapping original Chinese to English.
Terms: ${JSON.stringify(uniqueToFetch)}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText);
        for (const [cn, en] of Object.entries(parsed)) {
          const cleanEn = String(en).trim();
          if (cleanEn) {
            transCache.set(cn, cleanEn);
            result[cn] = cleanEn;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Gemini Translation API Warning]:', err.message);
  }

  // Fallback for remaining items
  for (const cn of uniqueToFetch) {
    if (!result[cn]) {
      result[cn] = cn;
    }
  }

  return result;
}

// Helper fetch with retry
async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 25000) {
  let lastErr;
  for (let i = 1; i <= retries; i++) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, i * 1500));
    }
  }
  throw lastErr;
}

// China portal login
async function loginChinaWh(wh) {
  const norm = String(wh || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let uid, pwd;
  if (norm === 'GZ') {
    uid = GZ_UID;
    pwd = GZ_PWD;
  } else if (norm === 'YW55' || norm === 'YW-55') {
    uid = YW55_UID;
    pwd = YW55_PWD;
  } else {
    uid = YW_UID;
    pwd = YW_PWD;
  }

  const params = new URLSearchParams({ code: uid, password: pwd, language: 'zh_CN' });
  const cleanBase = BASE_URL.replace(/\/s\/?$/i, '').replace(/\/+$/, '');
  const res = await fetchWithRetry(`${cleanBase}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const cookie = res.headers.get('set-cookie');
  const data = await res.json().catch(() => null);

  if (!data || data.code !== 200 || !cookie) {
    throw new Error(`Login failed for ${wh} (${uid}): ${data?.msg || 'Invalid response'}`);
  }

  const match = cookie.match(/JSESSIONID=[^;]+/i);
  return match ? match[0] : cookie.split(';')[0];
}

// Fetch portal records
async function fetchChinaRecords(wh, startDate, endDate, maxRecords = 2000, receiptCode = '') {
  const cookie = await loginChinaWh(wh);
  const cleanBase = BASE_URL.replace(/\/s\/?$/i, '').replace(/\/+$/, '');
  const limit = 200;
  let page = 1;
  let allRecords = [];

  const defaultEntryCode =
    wh === 'GZ' ? 'RS-21' : (wh === 'YW-55' || wh === 'YW55') ? 'YW-55' : 'AS-14';

  while (allRecords.length < maxRecords) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      startDate: startDate || '',
      endDate: endDate || '',
      stockState: '',
      code: receiptCode || '',
    });

    const res = await fetchWithRetry(`${cleanBase}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (data.code !== 200 || !Array.isArray(data.data)) break;

    const list = data.data.map((r) => ({
      id: String(r.id || ''),
      warehouse: wh,
      entryCode: String(r.entryCode || defaultEntryCode),
      code: String(r.code || '').trim(),
      date: String(r.date || '').slice(0, 10),
      rawDate: String(r.date || ''),
      commodity: String(r.commodity || '').trim(),
      packaging: String(r.packaging || '').trim(),
      mark: String(r.mark || '').trim(),
      actualQuantity: parseInt(String(r.actualQuantity || 0), 10) || 0,
      weight: String(r.weight || '').trim(),
      volume: String(r.volume || '').trim(),
      stockState: typeof r.stockState === 'number' ? r.stockState : 0,
      customerName: String(r.customerName || '').trim(),
      remark: String(r.remark || '').trim(),
      phone: String(r.phone || '').trim(),
    }));

    if (list.length === 0) break;
    allRecords = allRecords.concat(list);
    if (allRecords.length >= data.count || list.length < limit) break;
    page++;
  }

  return allRecords;
}

// Format date helper
function getFormattedDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function runCliSync() {
  const args = process.argv.slice(2);
  const isVerify = args.includes('--verify');
  const isSunday = args.includes('--sunday');
  const isMonth = args.includes('--month');
  const isDaemon = args.includes('--daemon');

  let mode = 'sync';
  let daysBack = 3;

  if (isVerify) {
    mode = 'verify_24h';
    daysBack = 2;
  } else if (isSunday) {
    mode = 'audit_sunday';
    daysBack = 7;
  } else if (isMonth) {
    mode = 'audit_month';
    daysBack = 30;
  }

  const whArg = args.find((a) => a.startsWith('--wh='));
  const targetWh = whArg ? whArg.split('=')[1].toUpperCase() : 'ALL';
  const whList = targetWh === 'ALL' ? ['GZ', 'YW', 'YW-55'] : [targetWh];

  const receiptArg = args.find((a) => a.startsWith('--receipt='));
  const singleReceiptCode = receiptArg ? receiptArg.split('=')[1].trim() : null;

  const endDate = getFormattedDate(new Date());
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - daysBack);
  const startDate = getFormattedDate(startDateObj);

  console.log(`\n======================================================`);
  console.log(`   CHINA WAREHOUSE SYNC ENGINE [MODE: ${mode.toUpperCase()}]`);
  console.log(`   Target Warehouses: ${whList.join(', ')}`);
  console.log(`   Date Range: ${startDate} to ${endDate} (${daysBack} days)`);
  console.log(`   Gemini API Key: ${GEMINI_API_KEY ? 'Active (Loaded)' : 'Missing'}`);
  console.log(`======================================================\n`);

  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  const db = mongoose.connection.db;

  let totalNew = 0;
  let totalMatched = 0;
  let totalMismatches = 0;
  let totalVerified = 0;

  for (const wh of whList) {
    console.log(`--> Fetching records for warehouse ${wh}...`);
    const records = await fetchChinaRecords(
      wh,
      singleReceiptCode ? '' : startDate,
      singleReceiptCode ? '' : endDate,
      2000,
      singleReceiptCode || ''
    );
    console.log(`    Found ${records.length} records in China portal for ${wh}.`);

    if (records.length === 0) continue;

    // Collect terms to translate
    const terms = [];
    records.forEach((r) => {
      if (r.commodity) terms.push(r.commodity);
      if (r.packaging) terms.push(r.packaging);
    });

    console.log(`    Translating ${terms.length} terms with Gemini AI...`);
    const transMap = await translateWithGemini(terms);

    const codes = records.map((r) => r.code);
    const existingDocs = await db.collection('warehousereceipts').find({
      warehouse: wh,
      receipt: { $in: codes },
    }).toArray();

    const existingMap = new Map();
    existingDocs.forEach((d) => existingMap.set(String(d.receipt).trim().toLowerCase(), d));

    let whNew = 0;
    let whMismatches = 0;
    let whVerified = 0;

    for (const item of records) {
      const codeKey = item.code.trim().toLowerCase();
      const existing = existingMap.get(codeKey);

      const transCommodity = transMap[item.commodity] || item.commodity || 'General Goods';
      const transPkg = transMap[item.packaging] || PKG_MAP[item.packaging] || 'Carton';

      if (!existing) {
        // INSERT NEW RECEIPT
        const newDoc = {
          receipt: item.code,
          party: item.customerName || 'General Party',
          warehouse: wh,
          warehouseEntry: item.entryCode,
          date: item.date,
          quantity: item.actualQuantity,
          loadedQuantity: 0,
          remainingQuantity: item.actualQuantity,
          weight: item.weight,
          loadedWeight: 0,
          remainingWeight: item.weight,
          volume: item.volume,
          loadedVolume: 0,
          remainingVolume: item.volume,
          commodity: transCommodity,
          chinese: item.commodity,
          english: transCommodity,
          packaging: transPkg,
          mainMarka: item.mark,
          subMarka: '',
          status: 'Received in Warehouse',
          stockstatus: 'In Stock',
          notes: item.remark || '',
          remarks: item.remark || '',
          phone: item.phone || '',
          isDelivered: false,
          isVerified: mode === 'verify_24h' || mode === 'audit_sunday',
          verifiedAt: (mode === 'verify_24h' || mode === 'audit_sunday') ? new Date() : null,
          lastChinaSyncAt: new Date(),
          chinaId: item.id,
          chinaStockState: item.stockState,
          hasMismatch: false,
          items: [
            {
              itemName: transCommodity,
              english: transCommodity,
              chinese: item.commodity,
              quantity: item.actualQuantity,
              packaging: transPkg,
              weight: item.weight,
              volume: item.volume,
              rate: '',
              rateUnit: 'CTN',
              cost: '',
              remarks: item.remark || '',
              mainMarka: item.mark,
              subMarka: '',
            },
          ],
          balanceItem: {
            name: transCommodity,
            ctn: item.actualQuantity,
            cbm: item.volume,
            weight: item.weight,
          },
          loadedItems: [],
          uploadBatchId: `SYNC-AUTO-${Date.now()}`,
          uploadedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection('warehousereceipts').insertOne(newDoc);
        existingMap.set(codeKey, newDoc);
        whNew++;
        totalNew++;
      } else {
        // EXISTING RECEIPT -> Check for receiving changes / mismatches
        const dbQty = parseInt(String(existing.quantity || 0), 10);
        const portalQty = item.actualQuantity;
        const dbWt = parseFloat(String(existing.weight || 0)) || 0;
        const portalWt = parseFloat(String(item.weight || 0)) || 0;
        const dbVol = parseFloat(String(existing.volume || 0)) || 0;
        const portalVol = parseFloat(String(item.volume || 0)) || 0;

        const diffs = [];
        if (dbQty !== portalQty) {
          diffs.push(`Qty: DB ${dbQty} vs Portal ${portalQty}`);
        }
        if (Math.abs(dbWt - portalWt) > 0.5 && portalWt > 0) {
          diffs.push(`Weight: DB ${dbWt}kg vs Portal ${portalWt}kg`);
        }
        if (Math.abs(dbVol - portalVol) > 0.05 && portalVol > 0) {
          diffs.push(`Volume: DB ${dbVol}m³ vs Portal ${portalVol}m³`);
        }

        if (diffs.length > 0) {
          // Log mismatch into chinasyncmismatches
          whMismatches++;
          totalMismatches++;

          await db.collection('chinasyncmismatches').updateOne(
            { receipt: item.code, warehouse: wh, status: 'PENDING' },
            {
              $set: {
                mismatchType: 'QUANTITY_MISMATCH',
                diffSummary: diffs.join('; '),
                dbData: {
                  quantity: dbQty,
                  weight: existing.weight,
                  volume: existing.volume,
                  mainMarka: existing.mainMarka,
                },
                portalData: {
                  actualQuantity: item.actualQuantity,
                  weight: item.weight,
                  volume: item.volume,
                  mark: item.mark,
                },
                auditPeriod: mode === 'verify_24h' ? 'DAILY_24H' : mode === 'audit_sunday' ? 'WEEKLY_7D' : 'REALTIME',
                detectedAt: new Date(),
                updatedAt: new Date(),
              },
              $setOnInsert: {
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );

          await db.collection('warehousereceipts').updateOne(
            { _id: existing._id },
            {
              $set: {
                hasMismatch: true,
                lastChinaSyncAt: new Date(),
                chinaId: item.id,
                chinaStockState: item.stockState,
              },
            }
          );
        } else {
          // Matched cleanly
          totalMatched++;
          const upd = {
            hasMismatch: false,
            lastChinaSyncAt: new Date(),
            chinaId: item.id,
            chinaStockState: item.stockState,
          };

          if (mode === 'verify_24h' || mode === 'audit_sunday') {
            upd.isVerified = true;
            upd.verifiedAt = new Date();
            whVerified++;
            totalVerified++;
          }

          await db.collection('warehousereceipts').updateOne(
            { _id: existing._id },
            { $set: upd }
          );
        }
      }
    }

    console.log(
      `    --> [${wh} Summary]: Inward New Added: ${whNew}, Mismatches: ${whMismatches}, Verified: ${whVerified}`
    );
  }

  console.log(`\n======================================================`);
  console.log(`   SYNC COMPLETE SUMMARY:`);
  console.log(`   Total New Receipts Added: ${totalNew}`);
  console.log(`   Total Existing Matched:   ${totalMatched}`);
  console.log(`   Total Mismatches Logged:  ${totalMismatches}`);
  console.log(`   Total Verified in Sync:   ${totalVerified}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

runCliSync().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
