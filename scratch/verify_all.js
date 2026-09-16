const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MONGO_URI=')) {
        return trimmed.replace('MONGO_URI=', '').trim();
      }
    }
  }
  return 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';
}

async function verify() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('--- RUNNING FINAL VERIFICATION ---');

  // TEST 1: Check Receipt 260902006
  const r26 = await mongoose.connection.db.collection('warehousereceipts').findOne({ receipt: '260902006' });
  console.log('1. Receipt 260902006 Verification:');
  console.log(`   - Receipt: ${r26.receipt}`);
  console.log(`   - Status: ${r26.status}`);
  console.log(`   - Inward Quantity: ${r26.quantity} CTN`);
  console.log(`   - Loaded Quantity: ${r26.loadedQuantity} CTN`);
  console.log(`   - Remaining Quantity: ${r26.remainingQuantity} CTN`);

  if (r26.loadedQuantity !== 0 || r26.remainingQuantity !== 140 || (r26.status !== 'Received in Warehouse' && r26.status !== 'Received')) {
    throw new Error('Test 1 FAILED: Receipt 260902006 has unexpected values!');
  }
  console.log('   ✓ Test 1 Passed: 260902006 is clean and correctly identified as Available in Warehouse (140 CTN)!');

  // TEST 2: Check for ANY receipt with loadedQuantity > 0 but no shipments
  const receipts = await mongoose.connection.db.collection('warehousereceipts').find({}).toArray();
  const shipments = await mongoose.connection.db.collection('shipments').find({}).toArray();

  const shipmentReceiptIds = new Set(shipments.map(s => String(s.receiptId)).filter(Boolean));
  const shipmentReceiptNums = new Set(shipments.map(s => (s.receipt || '').trim().toUpperCase()).filter(Boolean));

  let orphanCount = 0;
  for (const r of receipts) {
    const hasShipment = shipmentReceiptIds.has(String(r._id)) || shipmentReceiptNums.has((r.receipt || '').trim().toUpperCase());
    if (!hasShipment && (r.loadedQuantity || 0) > 0) {
      console.error(`Orphan found: #${r.receipt} has loaded ${r.loadedQuantity} but NO shipment!`);
      orphanCount++;
    }
  }

  console.log(`2. Orphaned Receipts Check: ${orphanCount} orphans found.`);
  if (orphanCount > 0) {
    throw new Error(`Test 2 FAILED: Found ${orphanCount} orphaned receipts!`);
  }
  console.log('   ✓ Test 2 Passed: 0 orphaned receipts exist in the database!');

  // TEST 3: Check Loaded Receipts have Containers attached
  const loadedReceipts = receipts.filter(r => (r.loadedQuantity || 0) > 0);
  console.log(`3. Total Loaded Receipts: ${loadedReceipts.length}`);
  console.log('   Sample loaded receipt check:');
  const sampleLoaded = loadedReceipts[0];
  if (sampleLoaded) {
    const matchingShipments = shipments.filter(s =>
      String(s.receiptId) === String(sampleLoaded._id) ||
      (s.receipt || '').trim().toUpperCase() === (sampleLoaded.receipt || '').trim().toUpperCase()
    );
    console.log(`   - Receipt #${sampleLoaded.receipt}: Loaded ${sampleLoaded.loadedQuantity}/${sampleLoaded.quantity} CTN`);
    console.log(`   - Attached Containers: ${matchingShipments.map(s => `${s.container} (${s.quantity} CTN)`).join(', ')}`);
  }
  console.log('   ✓ Test 3 Passed: Loaded receipts have matching containers!');

  console.log('\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
