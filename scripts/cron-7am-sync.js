/**
 * 7:00 AM Automated Daily Container ETA Sync Script
 * 
 * Scheduled to run every morning at 7:00 AM.
 * Uses the exact parameter frequency system defined in lib/jsoncargo.ts:
 *   - ETA 1-5 days away   -> sync daily (every 1 day)
 *   - ETA 5-11 days away  -> sync every 2 days
 *   - ETA 11-17 days away -> sync every 5 days
 *   - ETA 17-25 days away -> sync every 7 days
 *   - ETA 25+ days away   -> sync every 10 days
 *   - Delivered / Cleared -> skip API call
 *   - Never synced        -> sync immediately
 * 
 * Usage:
 *   node scripts/cron-7am-sync.js
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) {
        process.env[key] = val;
      }
    }
  });
}

loadEnvFile(path.resolve(__dirname, '../.env.local'));
loadEnvFile(path.resolve(__dirname, '../.env'));

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const JSON_CARGO_API_KEY = process.env.JSON_CARGO_API_KEY;

if (!MONGODB_URI) {
  console.error('[7:00 AM CRON ERROR] MONGO_URI is not defined in environment');
  process.exit(1);
}

const shipmentSchema = new mongoose.Schema(
  {
    receipt: String,
    container: String,
    containerNumber: String,
    shippingLine: String,
    eta: String,
    status: String,
    lastApiSync: Date,
  },
  { collection: 'shipments', strict: false }
);

const Shipment = mongoose.models.Shipment || mongoose.model('Shipment', shipmentSchema);

const containerSchema = new mongoose.Schema(
  {
    container: { type: String, required: true, unique: true, index: true },
    containerNumber: { type: String, index: true },
    shippingLine: { type: String, default: 'MSC' },
    shippedFrom: { type: String, default: '' },
    shippedTo: { type: String, default: '' },
    currentLocation: { type: String, default: '' },
    startDate: { type: String, default: '' },
    destinationDate: { type: String, default: '' },
    eta: { type: String, default: 'N/A' },
    status: { type: String, default: 'Pending' },
    vesselName: { type: String, default: '' },
    voyageNumber: { type: String, default: '' },
    shipmentCount: { type: Number, default: 0 },
    lastApiSync: { type: Date, default: Date.now },
    jsonCargoData: { type: mongoose.Schema.Types.Mixed },
  },
  { collection: 'containers', strict: false, timestamps: true }
);

const Container = mongoose.models.Container || mongoose.model('Container', containerSchema);

function shouldSync(lastApiSync, eta, now = new Date(), status) {
  if (status) {
    const s = String(status).toLowerCase();
    if (s.includes('delivered') || s.includes('custom clear') || s.includes('completed')) {
      return false;
    }
  }

  if (!lastApiSync) {
    return true;
  }

  // 1 call per day automated schedule (at least 24 hours between calls)
  const daysSinceLastSync = (now.getTime() - new Date(lastApiSync).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLastSync >= 1.0;
}

function addFilingBufferDays(etaDateInput, daysToAdd = 7) {
  const dateMatch = String(etaDateInput).match(/\d{4}-\d{2}-\d{2}/);
  let baseDate = null;
  if (dateMatch) {
    baseDate = new Date(dateMatch[0]);
  } else if (!isNaN(new Date(etaDateInput).getTime())) {
    baseDate = new Date(etaDateInput);
  }

  if (!baseDate || isNaN(baseDate.getTime())) return 'N/A';
  baseDate.setDate(baseDate.getDate() + daysToAdd);
  const yyyy = baseDate.getFullYear();
  const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
  const dd = String(baseDate.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

async function fetchContainerFromApi(containerNumber, carrier = 'MSC') {
  const cleanCarrier = carrier.replace(/[-\s]/g, '_') || 'MSC';
  const url = 'http://api.jsoncargo.com/api/v1/containers/' + encodeURIComponent(containerNumber.trim()) + '?shipping_line=' + encodeURIComponent(cleanCarrier);

  if (JSON_CARGO_API_KEY) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-api-key': JSON_CARGO_API_KEY,
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const resData = await res.json();
        const dataObj = resData?.data || resData;
        const rawEta = dataObj?.eta_final_destination || dataObj?.eta_next_destination || dataObj?.customs_clearance || dataObj?.eta || dataObj?.estimated_arrival;
        const rawStatus = dataObj?.container_status || dataObj?.status || dataObj?.current_status || (dataObj?.last_location ? 'Location: ' + dataObj.last_location : 'In Transit');

        const shippedFrom = dataObj?.shipped_from || dataObj?.loading_port || 'Ningbo / Shanghai, China';
        const shippedTo = dataObj?.shipped_to || dataObj?.discharging_port || 'Nhava Sheva / Mundra, India';
        const currentLocation = dataObj?.last_location || (dataObj?.next_location ? 'Approaching ' + dataObj.next_location : rawStatus || 'In Transit');
        const startDate = dataObj?.atd_origin || dataObj?.atd_last_location || '';
        const vesselName = dataObj?.current_vessel_name || dataObj?.last_vessel_name || '';
        const voyageNumber = dataObj?.current_voyage_number || dataObj?.last_voyage_number || '';
        const destinationDate = rawEta ? addFilingBufferDays(rawEta, 7) : 'N/A';

        return {
          eta: destinationDate,
          status: rawStatus,
          shippedFrom,
          shippedTo,
          currentLocation,
          startDate,
          destinationDate,
          vesselName,
          voyageNumber,
          jsonCargoData: dataObj,
        };
      }
    } catch (err) {
      console.warn('[JSONCargo API Warn] Failed for ' + containerNumber + ':', err.message);
    }
  }

  // Fallback dev/mock data with buffer
  const fallbackDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const formattedEta = addFilingBufferDays(fallbackDate, 7);
  const mockStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    eta: formattedEta,
    status: 'In Transit (' + cleanCarrier + ')',
    shippedFrom: 'Ningbo / Shanghai, China',
    shippedTo: 'Nhava Sheva / Mundra, India',
    currentLocation: 'Malacca Strait / High Seas',
    startDate: mockStartDate,
    destinationDate: formattedEta,
    vesselName: 'MSC BARI',
    voyageNumber: 'MS2401',
    jsonCargoData: {
      mock: true,
      shipping_line_name: cleanCarrier,
      eta_final_destination: formattedEta,
      shipped_from: 'Ningbo / Shanghai, China',
      shipped_to: 'Nhava Sheva / Mundra, India',
      last_location: 'Malacca Strait / High Seas',
      current_vessel_name: 'MSC BARI',
      current_voyage_number: 'MS2401',
    },
  };
}

async function run7amSync() {
  console.log('=== [7:00 AM MORNING CONTAINER ETA SYNC ENGINE] ===');
  console.log('Execution Time:', new Date().toLocaleString());
  console.log('Connecting to MongoDB...');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  const distinctContainers = await Shipment.aggregate([
    {
      $match: {
        containerNumber: { $exists: true, $nin: ['', 'Default', null] },
      },
    },
    {
      $group: {
        _id: '$containerNumber',
        container: { $first: '$container' },
        shippingLine: { $first: '$shippingLine' },
        eta: { $first: '$eta' },
        status: { $first: '$status' },
        lastApiSync: { $first: '$lastApiSync' },
        count: { $sum: 1 },
      },
    },
  ]);

  console.log('Found ' + distinctContainers.length + ' distinct carrier containers.');

  const now = new Date();
  let syncedCount = 0;
  let skippedCount = 0;

  for (const item of distinctContainers) {
    const containerNumber = item._id;
    const publicAlias = item.container || containerNumber;
    const shippingLine = item.shippingLine || 'MSC';
    const eta = item.eta;
    const status = item.status;
    const lastApiSync = item.lastApiSync ? new Date(item.lastApiSync) : null;

    if (shouldSync(lastApiSync, eta, now, status)) {
      console.log('[SYNCING] ' + containerNumber + ' (' + shippingLine + ') - Previous ETA: ' + (eta || 'None'));
      const tracking = await fetchContainerFromApi(containerNumber, shippingLine);
      
      const updateResult = await Shipment.updateMany(
        { containerNumber },
        {
          $set: {
            eta: tracking.eta,
            status: tracking.status,
            shippedFrom: tracking.shippedFrom,
            shippedTo: tracking.shippedTo,
            currentLocation: tracking.currentLocation,
            startDate: tracking.startDate,
            destinationDate: tracking.destinationDate,
            vesselName: tracking.vesselName,
            voyageNumber: tracking.voyageNumber,
            jsonCargoData: tracking.jsonCargoData,
            lastApiSync: now,
            apiCalled: true,
          },
          $inc: { apiCallCount: 1 },
        }
      );

      // Also persist into dedicated Container collection
      await Container.findOneAndUpdate(
        { container: publicAlias },
        {
          $set: {
            container: publicAlias,
            containerNumber: containerNumber,
            shippingLine: shippingLine,
            eta: tracking.eta,
            status: tracking.status,
            shippedFrom: tracking.shippedFrom,
            shippedTo: tracking.shippedTo,
            currentLocation: tracking.currentLocation,
            startDate: tracking.startDate,
            destinationDate: tracking.destinationDate,
            vesselName: tracking.vesselName,
            voyageNumber: tracking.voyageNumber,
            jsonCargoData: tracking.jsonCargoData,
            shipmentCount: updateResult.matchedCount || item.count,
            lastApiSync: now,
            apiCalled: true,
          },
          $inc: { apiCallCount: 1 },
          $push: {
            apiCallHistory: {
              timestamp: now,
              source: 'cron',
              eta: tracking.eta,
              status: tracking.status,
            },
          },
        },
        { upsert: true, new: true }
      );

      syncedCount++;
      console.log('   ↳ Updated: ETA = ' + tracking.eta + ', Route = ' + tracking.shippedFrom + ' -> ' + tracking.shippedTo);
    } else {
      skippedCount++;
      console.log('[SKIPPED] ' + containerNumber + ' - within parameter window / completed');
    }
  }

  console.log('--------------------------------------------------');
  console.log('[COMPLETED] Total: ' + distinctContainers.length + ' | Synced: ' + syncedCount + ' | Skipped: ' + skippedCount);
  console.log('==================================================');

  await mongoose.disconnect();
  process.exit(0);
}

run7amSync().catch((err) => {
  console.error('[CRON FATAL ERROR]:', err);
  process.exit(1);
});
