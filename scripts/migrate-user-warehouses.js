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
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

loadEnvFile(path.join(__dirname, '..', '.env.local'));
loadEnvFile(path.join(__dirname, '..', '.env'));

async function inspectAndMigrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI found in env');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGO_DB || 'cargo_tracker_v2' });
  const db = mongoose.connection.db;

  console.log('=== CURRENT WAREHOUSE COLLECTION ===');
  const whs = await db.collection('warehouses').find({}).toArray();
  console.log(whs.map(w => ({ _id: w._id, name: w.name, code: w.code })));

  console.log('\n=== DISTINCT WAREHOUSES IN WAREHOUSERECEIPT ===');
  const receiptWhs = await db.collection('warehousereceipts').distinct('warehouse');
  console.log(receiptWhs);
  for (const w of receiptWhs) {
    const count = await db.collection('warehousereceipts').countDocuments({ warehouse: w });
    console.log(`Receipts in '${w}': ${count}`);
  }

  console.log('\n=== DISTINCT WAREHOUSES IN SHIPMENTS ===');
  const shipmentWhs = await db.collection('shipments').distinct('warehouse');
  console.log(shipmentWhs);
  for (const w of shipmentWhs) {
    const count = await db.collection('shipments').countDocuments({ warehouse: w });
    console.log(`Shipments in '${w}': ${count}`);
  }

  console.log('\n=== DISTINCT WAREHOUSES IN CONTAINERS ===');
  const containerWhs = await db.collection('containers').distinct('warehouse');
  console.log(containerWhs);
  for (const w of containerWhs) {
    const count = await db.collection('containers').countDocuments({ warehouse: w });
    console.log(`Containers in '${w}': ${count}`);
  }

  await mongoose.disconnect();
}

inspectAndMigrate().catch(console.error);
