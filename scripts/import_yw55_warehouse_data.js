/**
 * Import all data from China Warehouse (YW-55) into MongoDB
 * Target: https://zg.kuaisongkj.com (UID: YW-55, Password: 157243)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load env
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
          if (!process.env[key]) process.env[key] = val;
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

const RAW_BASE_URL = process.env.CHINA_WH_BASE_URL || 'https://zg.kuaisongkj.com';
const BASE_URL = RAW_BASE_URL.replace(/\/s\/?$/i, '').replace(/\/+$/, '');
const UID = process.env.CHINA_WH_YW55_UID || 'YW-55';
const PASSWORD = process.env.CHINA_WH_YW55_PWD || '157243';
const WH_NAME = 'YW-55';

// Packaging standard translation map
const PKG_MAP = {
  '木架': 'Wooden frame',
  '木箱': 'Wooden box',
  '纸箱': 'Carton',
  '编织袋': 'Woven bag',
  '托盘': 'Pallet',
  '铁框': 'Iron cage',
  '胶袋': 'Plastic bag',
  '裸装': 'Bare cargo / Unpackaged',
};

// Check if string has Chinese
function hasChinese(str) {
  return /[\u4e00-\u9fa5]/.test(String(str || ''));
}

// In-memory cache for translations
const transCache = new Map();

// Helper fetch with retry and timeout
async function fetchWithRetry(url, options = {}, retries = 4, timeoutMs = 30000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`    [Network Warning] Attempt ${attempt}/${retries} failed (${err.message}). Retrying in ${attempt * 1.5}s...`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastErr;
}

// Gemini batch translator
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

  // Chunk in batches of 40 for Gemini
  const CHUNK_SIZE = 40;
  for (let i = 0; i < uniqueToFetch.length; i += CHUNK_SIZE) {
    const chunk = uniqueToFetch.slice(i, i + CHUNK_SIZE);
    try {
      const prompt = `You are a professional international logistics and customs expert.
Translate the following Chinese logistics commodity names and cargo terms into clean, concise, standard English cargo terms.
Rules:
1. Return ONLY a valid JSON object where keys are the exact original Chinese strings and values are the English translations.
2. Translate standard items cleanly (e.g. "干手器" -> "Hand Dryers", "轮毂轴承" -> "Wheel Hub Bearings", "纸箱" -> "Carton").
3. Do not include markdown codeblocks, notes, or explanations.

Input JSON:
${JSON.stringify(chunk)}`;

      const resp = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        },
        2,
        20000
      );

      if (resp.ok) {
        const data = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          for (const [cn, en] of Object.entries(parsed)) {
            result[cn] = en;
            transCache.set(cn, en);
          }
        }
      }
    } catch (e) {
      console.warn(`    [Gemini Translation Notice] Fallback for chunk ${i}-${i + CHUNK_SIZE}: ${e.message}`);
    }

    // Set remaining fallback
    for (const cn of chunk) {
      if (!result[cn]) {
        result[cn] = cn;
        transCache.set(cn, cn);
      }
    }
  }

  return result;
}

// Login
async function loginChinaWh() {
  console.log(`[1/4] Logging into China Warehouse Portal at ${BASE_URL}...`);
  console.log(`      Using UID: "${UID}"`);

  const params = new URLSearchParams({
    code: UID,
    password: PASSWORD,
    language: 'zh_CN',
  });

  const res = await fetchWithRetry(`${BASE_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  }, 4, 30000);

  const cookie = res.headers.get('set-cookie');
  const data = await res.json().catch(() => null);

  if (!data || data.code !== 200 || !cookie) {
    throw new Error(`Login failed for ${UID}: ${data?.msg || 'Invalid response'}`);
  }

  const match = cookie.match(/JSESSIONID=[^;]+/i);
  const sessionCookie = match ? match[0] : cookie.split(';')[0];
  console.log(`      ✓ Login successful! Session cookie obtained.`);
  return sessionCookie;
}

// Fetch all pages
async function fetchAllPortalRecords(cookie) {
  console.log(`\n[2/4] Fetching all records from China warehouse portal...`);
  const limit = 200;
  let page = 1;
  let allRecords = [];
  let totalCount = 0;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      startDate: '',
      endDate: '',
      stockState: '',
      code: '',
    });

    const res = await fetchWithRetry(`${BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: params.toString(),
    }, 4, 35000);

    const data = await res.json();
    if (data.code !== 200 || !Array.isArray(data.data)) {
      console.warn(`    Unexpected response on page ${page}:`, data);
      break;
    }

    if (totalCount === 0 && data.count) {
      totalCount = data.count;
      const totalPages = Math.ceil(totalCount / limit);
      console.log(`      Portal reports total ${totalCount} records (~${totalPages} pages).`);
    }

    const list = data.data.map((r) => {
      const rawDate = String(r.date || '').trim();
      let formattedDate = '';
      if (rawDate) formattedDate = rawDate.slice(0, 10);

      return {
        id: String(r.id || ''),
        warehouse: WH_NAME,
        entryCode: String(r.entryCode || UID).trim(),
        code: String(r.code || '').trim(),
        date: formattedDate || new Date().toISOString().slice(0, 10),
        rawDate,
        commodity: String(r.commodity || '').trim(),
        packaging: String(r.packaging || '').trim(),
        mark: String(r.mark || '').trim(),
        actualQuantity: parseInt(String(r.actualQuantity || 0), 10) || 0,
        weight: String(r.weight || '').trim(),
        volume: String(r.volume || '').trim(),
        stockState: typeof r.stockState === 'number' ? r.stockState : 0,
        customerName: String(r.customerName || UID).trim(),
        remark: String(r.remark || '').trim(),
        phone: String(r.phone || '').trim(),
        location: String(r.location || '').trim(),
      };
    });

    if (list.length === 0) break;
    allRecords = allRecords.concat(list);
    console.log(`      Page ${page}: Fetched ${list.length} records (Progress: ${allRecords.length}/${totalCount || '?'})`);

    if (allRecords.length >= data.count || list.length < limit) break;
    page++;
  }

  console.log(`      ✓ Completed fetching: ${allRecords.length} records retrieved.`);
  return allRecords;
}

// Ingest into MongoDB
async function ingestRecords(records) {
  console.log(`\n[3/4] Translating commodities and preparing DB operations...`);

  // Collect terms to translate
  const terms = [];
  records.forEach((r) => {
    if (r.commodity) terms.push(r.commodity);
    if (r.packaging) terms.push(r.packaging);
  });

  const uniqueTerms = Array.from(new Set(terms));
  console.log(`      Unique terms to translate: ${uniqueTerms.length}`);
  const transMap = await translateWithGemini(uniqueTerms);
  console.log(`      ✓ Translations ready.`);

  console.log(`\n[4/4] Ingesting ${records.length} records into MongoDB collection "warehousereceipts"...`);
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
  const db = mongoose.connection.db;
  const collection = db.collection('warehousereceipts');

  const uploadBatchId = `IMPORT-YW55-${Date.now()}`;
  const now = new Date();

  // Find all existing receipts for this warehouse to preserve local modifications
  const existingCodes = records.map((r) => r.code).filter(Boolean);
  const existingDocs = await collection
    .find({ receipt: { $in: existingCodes }, warehouse: WH_NAME })
    .project({ receipt: 1, loadedQuantity: 1, quantity: 1, status: 1, stockstatus: 1 })
    .toArray();

  const existingMap = new Map();
  existingDocs.forEach((d) => existingMap.set(String(d.receipt).trim().toLowerCase(), d));

  const bulkOps = [];
  let newCount = 0;
  let updateCount = 0;

  for (const item of records) {
    if (!item.code) continue;
    const codeKey = item.code.trim().toLowerCase();
    const existing = existingMap.get(codeKey);

    const translatedCommodity = transMap[item.commodity] || item.commodity || 'General Merchandise';
    const translatedPackaging = transMap[item.packaging] || PKG_MAP[item.packaging] || item.packaging || 'Carton';
    const cleanMark = item.mark || '';

    if (!existing) {
      newCount++;
      bulkOps.push({
        insertOne: {
          document: {
            receipt: item.code,
            party: item.customerName || UID,
            warehouse: WH_NAME,
            warehouseEntry: item.entryCode || UID,
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
            commodity: translatedCommodity,
            chinese: item.commodity,
            english: translatedCommodity,
            packaging: translatedPackaging,
            mainMarka: cleanMark,
            subMarka: '',
            status: 'Received in Warehouse',
            stockstatus: item.stockState === 1 ? 'Dispatched' : 'In Stock',
            deliveryDate: '',
            isDelivered: false,
            notes: item.remark || (item.location ? `Location: ${item.location}` : ''),
            remarks: item.remark || '',
            isLabblerGoods: false,
            phone: item.phone || '',
            partyPhone: item.phone || '',
            rate: '',
            'Overall / Receipt Freight Rate': '',
            rateFixed: false,
            totalCost: '',
            cost: '',
            goodsItems: [],
            salesPerson: '',
            salesPersonUsername: '',
            salesRate: '',
            salesRemarks: '',
            salesStatus: 'Normal',
            holdReason: '',
            messageSent: false,
            messageSentAt: null,
            messageSentDate: '',
            uploadBatchId,
            uploadedAt: now,
            isVerified: false,
            verifiedAt: null,
            lastChinaSyncAt: now,
            chinaId: item.id,
            chinaStockState: item.stockState,
            hasMismatch: false,
            items: [
              {
                itemName: translatedCommodity,
                english: translatedCommodity,
                chinese: item.commodity,
                quantity: item.actualQuantity,
                packaging: translatedPackaging,
                weight: item.weight,
                volume: item.volume,
                rate: '',
                rateUnit: 'CTN',
                cost: '',
                remarks: item.remark || '',
                mainMarka: cleanMark,
                subMarka: '',
              },
            ],
            balanceItem: {
              name: translatedCommodity,
              ctn: item.actualQuantity,
              cbm: item.volume,
              weight: item.weight,
            },
            loadedItems: [],
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      updateCount++;
      // Existing record: preserve loadedQuantity
      const loaded = typeof existing.loadedQuantity === 'number' ? existing.loadedQuantity : 0;
      const totalQty = loaded > 0 ? (loaded + item.actualQuantity) : item.actualQuantity;
      const remainingQty = item.actualQuantity;

      bulkOps.push({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              quantity: totalQty,
              remainingQuantity: remainingQty,
              remainingWeight: item.weight,
              remainingVolume: item.volume,
              commodity: translatedCommodity,
              chinese: item.commodity,
              english: translatedCommodity,
              packaging: translatedPackaging,
              mainMarka: cleanMark,
              lastChinaSyncAt: now,
              chinaId: item.id,
              chinaStockState: item.stockState,
              updatedAt: now,
            },
          },
        },
      });
    }
  }

  // Execute in batches of 500
  const BATCH_SIZE = 500;
  for (let b = 0; b < bulkOps.length; b += BATCH_SIZE) {
    const slice = bulkOps.slice(b, b + BATCH_SIZE);
    await collection.bulkWrite(slice, { ordered: false });
    console.log(`      Bulk wrote ${Math.min(b + BATCH_SIZE, bulkOps.length)}/${bulkOps.length} operations...`);
  }

  console.log(`\n======================================================`);
  console.log(`   DATA IMPORT COMPLETED FOR WAREHOUSE ${WH_NAME}`);
  console.log(`   Total records processed: ${records.length}`);
  console.log(`   New receipts inserted:   ${newCount}`);
  console.log(`   Existing updated:        ${updateCount}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
  return { total: records.length, newCount, updateCount };
}

async function main() {
  const startTime = Date.now();
  console.log(`======================================================`);
  console.log(`   IMPORT CHINA WAREHOUSE DATA: ${WH_NAME}`);
  console.log(`   Portal URL: ${BASE_URL}`);
  console.log(`   UID: ${UID}`);
  console.log(`======================================================\n`);

  const cookie = await loginChinaWh();
  const records = await fetchAllPortalRecords(cookie);
  const res = await ingestRecords(records);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${durationSec}s!`);
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
