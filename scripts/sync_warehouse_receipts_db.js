const mongoose = require('mongoose');
const fs = require('fs');

const path = require('path');

function getMongoUri() {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('MONGO_URI=')) {
          return trimmed.replace('MONGO_URI=', '').replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  }
  throw new Error('MONGO_URI is not defined in environment or .env/.env.local');
}

const GENERIC_MARKA_WORDS = new Set([
  'PARTY', 'GENERAL', 'GENERALPARTY', 'TRADERS', 'TRADING', 'ENTERPRISES',
  'ENTERPRISE', 'IMPEX', 'EXPORTS', 'IMPORTS', 'EXPORT', 'IMPORT',
  'PVT', 'LTD', 'LIMITED', 'CORP', 'CORPORATION', 'CO', 'COMPANY',
  'CARGO', 'LOGISTICS', 'INTERNATIONAL', 'INDIA', 'CHINA', 'WAREHOUSE'
]);

function normalizeMarkaStr(str) {
  if (!str) return '';
  return String(str).toUpperCase().replace(/[\s\-_/\\,.]+/g, '').trim();
}

function extractDistinctiveTokens(str) {
  if (!str) return [];
  const rawTokens = String(str).toUpperCase().split(/[\s,;/\\|_\-]+/).filter(Boolean);
  return rawTokens
    .map(t => t.replace(/[^A-Z0-9]/g, '').trim())
    .filter(t => t.length >= 2 && !GENERIC_MARKA_WORDS.has(t));
}

function isMarkaMatch(targetMarka, itemMarka) {
  if (!targetMarka || !itemMarka) return false;
  const tNorm = normalizeMarkaStr(targetMarka);
  const mNorm = normalizeMarkaStr(itemMarka);
  if (!tNorm || !mNorm) return false;
  if (GENERIC_MARKA_WORDS.has(tNorm) || GENERIC_MARKA_WORDS.has(mNorm)) return false;
  if (tNorm === mNorm) return true;

  // 1. Composite / Delimited list check: e.g. 'SJT-720/1 / SJT-720/2' vs 'SJT-720/1'
  const tDelim = String(targetMarka).toUpperCase().split(/[,;|/]+/).map(normalizeMarkaStr).filter(Boolean);
  const mDelim = String(itemMarka).toUpperCase().split(/[,;|/]+/).map(normalizeMarkaStr).filter(Boolean);
  if (tDelim.some(t => !GENERIC_MARKA_WORDS.has(t) && mDelim.includes(t))) return true;

  // 2. Normalized prefix check for shipping mark codes (e.g. SJT720 vs SJT720A)
  if (tNorm.length >= 4 && mNorm.length >= 4) {
    if (tNorm.startsWith(mNorm) || mNorm.startsWith(tNorm)) {
      const diff = Math.abs(tNorm.length - mNorm.length);
      if (diff <= 2) return true;
    }
  }

  // 3. Distinctive words matching (excluding generic business terms like TRADERS, PARTY, IMPEX)
  const tTokens = extractDistinctiveTokens(targetMarka);
  const mTokens = extractDistinctiveTokens(itemMarka);
  if (tTokens.length === 0 || mTokens.length === 0) return false;

  const hasExactTokenMatch = tTokens.some(t => mTokens.some(m => t === m && t.length >= 3));
  if (hasExactTokenMatch) {
    if (tTokens.length >= 2 && mTokens.length >= 2) {
      const overlap = tTokens.filter(t => mTokens.includes(t)).length;
      return overlap >= Math.min(tTokens.length, mTokens.length);
    }
    return true;
  }

  return false;
}

async function syncDb() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const whReceipts = await db.collection('warehousereceipts').find({}).toArray();
  const shipments = await db.collection('shipments').find({}).toArray();

  const shipmentsByReceipt = new Map();
  for (const s of shipments) {
    const r = (s.receipt || '').trim().toLowerCase();
    if (!shipmentsByReceipt.has(r)) shipmentsByReceipt.set(r, []);
    shipmentsByReceipt.get(r).push(s);
  }

  const updatedRecords = [];

  for (const w of whReceipts) {
    const r = (w.receipt || '').trim().toLowerCase();
    const wWh = (w.warehouse || '').trim().toUpperCase();
    const wMarka = (w.mainMarka || w.subMarka || w.party || '').trim().toUpperCase();
    const allShipsForReceipt = shipmentsByReceipt.get(r) || [];

    // Filter shipments strictly for this warehouse receipt by Receipt No + Warehouse + Marka
    const ships = allShipsForReceipt.filter(s => {
      if (s.receiptId && String(s.receiptId) === String(w._id)) return true;
      const sWh = (s.warehouse || '').trim().toUpperCase();
      if (sWh && wWh && sWh !== wWh) return false;
      const sMarka = (s.mainMarka || s.subMarka || s.party || '').trim().toUpperCase();
      if (sMarka && wMarka) {
        if (!isMarkaMatch(wMarka, sMarka)) return false;
      }
      return true;
    });

    const actualLoaded = ships.reduce((sum, s) => sum + (parseFloat(String(s.quantity || '0')) || 0), 0);
    const recordedLoaded = typeof w.loadedQuantity === 'number' ? w.loadedQuantity : (parseFloat(String(w.loadedQuantity || '0')) || 0);
    const totalQty = typeof w.quantity === 'number' ? w.quantity : (parseFloat(String(w.quantity || '0')) || 0);
    const recordedRemaining = typeof w.remainingQuantity === 'number' ? w.remainingQuantity : (totalQty - recordedLoaded);
    const actualRemaining = Math.max(0, totalQty - actualLoaded);

    if (actualLoaded !== recordedLoaded || actualRemaining !== recordedRemaining) {
      const isDelivered = Boolean(w.isDelivered || (w.status && /deliver/i.test(w.status)));
      let newStatus = w.status;
      let newStockStatus = w.stockstatus;

      if (!isDelivered) {
        if (actualRemaining === 0) {
          newStatus = 'Fully Loaded';
          newStockStatus = 'Dispatched';
        } else if (actualLoaded > 0) {
          newStatus = 'Partially Loaded';
          newStockStatus = 'Partially Dispatched';
        } else {
          newStatus = 'Received in Warehouse';
          newStockStatus = 'In Stock';
        }
      }

      await db.collection('warehousereceipts').updateOne(
        { _id: w._id },
        {
          $set: {
            loadedQuantity: actualLoaded,
            remainingQuantity: actualRemaining,
            status: newStatus,
            stockstatus: newStockStatus,
            'balanceItem.ctn': actualRemaining,
            updatedAt: new Date()
          }
        }
      );

      updatedRecords.push({
        _id: String(w._id),
        receiptNo: w.receipt,
        warehouse: w.warehouse || 'CHINA',
        marka: w.mainMarka || w.party || '-',
        totalQuantity: totalQty,
        previousLoaded: recordedLoaded,
        newLoaded: actualLoaded,
        previousRemaining: recordedRemaining,
        newRemaining: actualRemaining,
        previousStatus: w.status,
        newStatus: newStatus,
        loadedContainers: ships.map(s => s.container + ' (' + s.quantity + ' ctn)').join(', ') || 'None'
      });
    }
  }

  console.log('Successfully updated records count:', updatedRecords.length);
  fs.writeFileSync('sync_audit_report.json', JSON.stringify(updatedRecords, null, 2));

  await mongoose.disconnect();
}

syncDb().catch(console.error);
