/**
 * Database Migration: Correct China Warehouse Names
 *
 * Updates all occurrences of:
 *   - 'GZ' / 'Guangzhou' -> 'RS-21'
 *   - 'YW' / 'Yiwu'      -> 'AS-14'
 *
 * Safely handles unique index { receipt: 1, warehouse: 1 }
 * by deduplicating if a record already exists under the new code.
 */

const mongoose = require('mongoose');

async function migrate() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB,
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 30000,
  });
  const db = mongoose.connection.db;
  console.log('✅ Connected to MongoDB.');

  // 1. warehousereceipts deduplication and migration
  const wrColl = db.collection('warehousereceipts');
  const gzDocs = await wrColl.find({ warehouse: { $in: ['GZ', 'Guangzhou', 'GUANGZHOU'] } }).toArray();
  console.log(`\n[warehousereceipts] Found ${gzDocs.length} GZ records.`);

  let gzUpdated = 0;
  let gzDupsRemoved = 0;

  for (const doc of gzDocs) {
    const existingRs21 = await wrColl.findOne({ receipt: doc.receipt, warehouse: 'RS-21' });
    if (existingRs21) {
      // Duplicate copy already preserved in RS-21
      await wrColl.deleteOne({ _id: doc._id });
      gzDupsRemoved++;
    } else {
      await wrColl.updateOne({ _id: doc._id }, { $set: { warehouse: 'RS-21' } });
      gzUpdated++;
    }
  }
  console.log(`  ✓ Transferred ${gzUpdated} unique receipts to 'RS-21'.`);
  console.log(`  ✓ Removed ${gzDupsRemoved} duplicate copies already preserved in 'RS-21'.`);

  const ywDocs = await wrColl.find({ warehouse: { $in: ['YW', 'Yiwu', 'YIWU'] } }).toArray();
  console.log(`\n[warehousereceipts] Found ${ywDocs.length} YW records.`);

  let ywUpdated = 0;
  let ywDupsRemoved = 0;

  for (const doc of ywDocs) {
    const existingAs14 = await wrColl.findOne({ receipt: doc.receipt, warehouse: 'AS-14' });
    if (existingAs14) {
      // Duplicate copy already preserved in AS-14
      await wrColl.deleteOne({ _id: doc._id });
      ywDupsRemoved++;
    } else {
      await wrColl.updateOne({ _id: doc._id }, { $set: { warehouse: 'AS-14' } });
      ywUpdated++;
    }
  }
  console.log(`  ✓ Transferred ${ywUpdated} unique receipts to 'AS-14'.`);
  console.log(`  ✓ Removed ${ywDupsRemoved} duplicate copies already preserved in 'AS-14'.`);

  // 2. receipttrackings (nested receipts array)
  const rtColl = db.collection('receipttrackings');
  const rtGzRes = await rtColl.updateMany(
    { 'receipts.warehouse': { $in: ['GZ', 'Guangzhou', 'GUANGZHOU'] } },
    { $set: { 'receipts.$[elem].warehouse': 'RS-21' } },
    { arrayFilters: [{ 'elem.warehouse': { $in: ['GZ', 'Guangzhou', 'GUANGZHOU'] } }] }
  );
  const rtYwRes = await rtColl.updateMany(
    { 'receipts.warehouse': { $in: ['YW', 'Yiwu', 'YIWU'] } },
    { $set: { 'receipts.$[elem].warehouse': 'AS-14' } },
    { arrayFilters: [{ 'elem.warehouse': { $in: ['YW', 'Yiwu', 'YIWU'] } }] }
  );
  console.log(`\n[receipttrackings]`);
  console.log(`  ✓ Updated ${rtGzRes.modifiedCount} link(s) with GZ -> 'RS-21'.`);
  console.log(`  ✓ Updated ${rtYwRes.modifiedCount} link(s) with YW -> 'AS-14'.`);

  // 3. shipments
  const shColl = db.collection('shipments');
  const shGzRes = await shColl.updateMany(
    { warehouse: { $in: ['GZ', 'Guangzhou', 'GUANGZHOU'] } },
    { $set: { warehouse: 'RS-21' } }
  );
  const shYwRes = await shColl.updateMany(
    { warehouse: { $in: ['YW', 'Yiwu', 'YIWU'] } },
    { $set: { warehouse: 'AS-14' } }
  );
  console.log(`\n[shipments]`);
  console.log(`  ✓ Updated ${shGzRes.modifiedCount} shipments to 'RS-21'.`);
  console.log(`  ✓ Updated ${shYwRes.modifiedCount} shipments to 'AS-14'.`);

  // 4. containers
  const cColl = db.collection('containers');
  const cGzRes = await cColl.updateMany(
    { warehouse: { $in: ['GZ', 'Guangzhou', 'GUANGZHOU'] } },
    { $set: { warehouse: 'RS-21' } }
  );
  const cYwRes = await cColl.updateMany(
    { warehouse: { $in: ['YW', 'Yiwu', 'YIWU'] } },
    { $set: { warehouse: 'AS-14' } }
  );
  console.log(`\n[containers]`);
  console.log(`  ✓ Updated ${cGzRes.modifiedCount} containers to 'RS-21'.`);
  console.log(`  ✓ Updated ${cYwRes.modifiedCount} containers to 'AS-14'.`);

  // Summary counts
  console.log(`\n=== FINAL DATABASE WAREHOUSE DISTRIBUTION ===`);
  const wrDistinct = await wrColl.distinct('warehouse');
  console.log('warehousereceipts warehouses:', wrDistinct);
  for (const wh of wrDistinct) {
    const cnt = await wrColl.countDocuments({ warehouse: wh });
    console.log(`  - ${wh}: ${cnt} receipts`);
  }

  const shDistinct = await shColl.distinct('warehouse');
  console.log('\nshipments warehouses:', shDistinct);
  for (const wh of shDistinct) {
    const cnt = await shColl.countDocuments({ warehouse: wh });
    console.log(`  - ${wh}: ${cnt} shipments`);
  }

  console.log('\n🎉 Warehouse name migration completed successfully!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
