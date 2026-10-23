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

async function executeWarehouseTransferAndCleanup() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI found in environment.');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: process.env.MONGO_DB || 'cargo_tracker_v2' });
  const db = mongoose.connection.db;

  console.log('====================================================');
  console.log('  STARTING WAREHOUSE DATA TRANSFER & CONSOLIDATION  ');
  console.log('====================================================');

  const jiuBianRegex = /九边仓库/i;
  const zongBuRegex = /总部/i;

  // -------------------------------------------------------------------------
  // PART 1: Transfer 九边仓库 (China Warehouse) -> GZ
  // -------------------------------------------------------------------------
  console.log('\n[1/2] Processing 九边仓库 (China Warehouse) -> GZ...');

  // 1a. Update Shipments
  const jbShipments = await db.collection('shipments').updateMany(
    { warehouse: jiuBianRegex },
    { $set: { warehouse: 'GZ' } }
  );
  console.log(`  ✓ Updated ${jbShipments.modifiedCount} shipment(s) to warehouse 'GZ'.`);

  // 1b. Update Containers
  const jbContainers = await db.collection('containers').updateMany(
    { warehouse: jiuBianRegex },
    { $set: { warehouse: 'GZ' } }
  );
  console.log(`  ✓ Updated ${jbContainers.modifiedCount} container(s) to warehouse 'GZ'.`);

  // 1c. Update UploadHistory
  const jbUploads = await db.collection('uploadhistories').updateMany(
    { warehouse: jiuBianRegex },
    { $set: { warehouse: 'GZ' } }
  );
  console.log(`  ✓ Updated ${jbUploads.modifiedCount} upload history batch(es) to warehouse 'GZ'.`);

  // 1d. Handle Warehouse Receipts for 九边仓库
  const gzReceipts = await db.collection('warehousereceipts').find({ warehouse: 'GZ' }).toArray();
  const gzReceiptSet = new Set(gzReceipts.map((r) => r.receipt));

  const jiuBianReceipts = await db.collection('warehousereceipts').find({ warehouse: jiuBianRegex }).toArray();
  const uniqueToJiuBian = jiuBianReceipts.filter((r) => !gzReceiptSet.has(r.receipt));
  const duplicateInGz = jiuBianReceipts.filter((r) => gzReceiptSet.has(r.receipt));

  console.log(`  Found in 九边: ${uniqueToJiuBian.length} unique receipts, ${duplicateInGz.length} duplicate copies already in GZ.`);

  // Transfer unique receipts to GZ
  if (uniqueToJiuBian.length > 0) {
    const uniqueIds = uniqueToJiuBian.map((r) => r._id);
    const transferred = await db.collection('warehousereceipts').updateMany(
      { _id: { $in: uniqueIds } },
      { $set: { warehouse: 'GZ' } }
    );
    console.log(`  ✓ Transferred ${transferred.modifiedCount} unique receipt(s) (${uniqueToJiuBian.map(r => r.receipt).join(', ')}) to 'GZ'.`);
  }

  // Remove duplicate copies in 九边仓库
  if (duplicateInGz.length > 0) {
    const dupIds = duplicateInGz.map((r) => r._id);
    const removedDups = await db.collection('warehousereceipts').deleteMany({ _id: { $in: dupIds } });
    console.log(`  ✓ Removed ${removedDups.deletedCount} duplicate receipt copy/copies from 九边仓库 (already preserved in GZ).`);
  }

  // 1e. Delete 九边仓库 from Warehouse collection
  const delJbWh = await db.collection('warehouses').deleteMany({ name: jiuBianRegex });
  console.log(`  ✓ Deleted 九边仓库 (China Warehouse) from warehouses collection: ${delJbWh.deletedCount} warehouse deleted.`);


  // -------------------------------------------------------------------------
  // PART 2: Transfer 总部 (China Warehouse) -> YW
  // -------------------------------------------------------------------------
  console.log('\n[2/2] Processing 总部 (China Warehouse) -> YW...');

  // 2a. Update Shipments
  const zbShipments = await db.collection('shipments').updateMany(
    { warehouse: zongBuRegex },
    { $set: { warehouse: 'YW' } }
  );
  console.log(`  ✓ Updated ${zbShipments.modifiedCount} shipment(s) to warehouse 'YW'.`);

  // 2b. Update Containers
  const zbContainers = await db.collection('containers').updateMany(
    { warehouse: zongBuRegex },
    { $set: { warehouse: 'YW' } }
  );
  console.log(`  ✓ Updated ${zbContainers.modifiedCount} container(s) to warehouse 'YW'.`);

  // 2c. Update UploadHistory
  const zbUploads = await db.collection('uploadhistories').updateMany(
    { warehouse: zongBuRegex },
    { $set: { warehouse: 'YW' } }
  );
  console.log(`  ✓ Updated ${zbUploads.modifiedCount} upload history batch(es) to warehouse 'YW'.`);

  // 2d. Handle Warehouse Receipts for 总部
  const ywReceipts = await db.collection('warehousereceipts').find({ warehouse: 'YW' }).toArray();
  const ywReceiptSet = new Set(ywReceipts.map((r) => r.receipt));

  const zongBuReceipts = await db.collection('warehousereceipts').find({ warehouse: zongBuRegex }).toArray();
  const uniqueToZongBu = zongBuReceipts.filter((r) => !ywReceiptSet.has(r.receipt));
  const duplicateInYw = zongBuReceipts.filter((r) => ywReceiptSet.has(r.receipt));

  console.log(`  Found in 总部: ${uniqueToZongBu.length} unique receipts, ${duplicateInYw.length} duplicate copies already in YW.`);

  // Transfer unique receipts to YW if any
  if (uniqueToZongBu.length > 0) {
    const uniqueIds = uniqueToZongBu.map((r) => r._id);
    const transferred = await db.collection('warehousereceipts').updateMany(
      { _id: { $in: uniqueIds } },
      { $set: { warehouse: 'YW' } }
    );
    console.log(`  ✓ Transferred ${transferred.modifiedCount} unique receipt(s) (${uniqueToZongBu.map(r => r.receipt).join(', ')}) to 'YW'.`);
  }

  // Remove duplicate copies in 总部
  if (duplicateInYw.length > 0) {
    const dupIds = duplicateInYw.map((r) => r._id);
    const removedDups = await db.collection('warehousereceipts').deleteMany({ _id: { $in: dupIds } });
    console.log(`  ✓ Removed ${removedDups.deletedCount} duplicate receipt copy/copies from 总部 (already preserved in YW).`);
  }

  // 2e. Delete 总部 from Warehouse collection
  const delZbWh = await db.collection('warehouses').deleteMany({ name: zongBuRegex });
  console.log(`  ✓ Deleted 总部 (China Warehouse) from warehouses collection: ${delZbWh.deletedCount} warehouse deleted.`);


  // -------------------------------------------------------------------------
  // PART 3: Post-Migration Verification
  // -------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log('             POST-MIGRATION VERIFICATION            ');
  console.log('====================================================');

  const finalWhs = await db.collection('warehouses').find({}).toArray();
  console.log('Active Warehouses:', finalWhs.map((w) => w.name));

  const distinctReceiptWhs = await db.collection('warehousereceipts').distinct('warehouse');
  console.log('\nWarehouseReceipt counts:');
  for (const w of distinctReceiptWhs) {
    const count = await db.collection('warehousereceipts').countDocuments({ warehouse: w });
    console.log(`  • ${w}: ${count} receipts`);
  }

  const distinctShipmentWhs = await db.collection('shipments').distinct('warehouse');
  console.log('\nShipment counts:');
  for (const w of distinctShipmentWhs) {
    const count = await db.collection('shipments').countDocuments({ warehouse: w });
    console.log(`  • ${w}: ${count} shipments`);
  }

  const distinctContainerWhs = await db.collection('containers').distinct('warehouse');
  console.log('\nContainer counts:');
  for (const w of distinctContainerWhs) {
    const count = await db.collection('containers').countDocuments({ warehouse: w });
    console.log(`  • ${w}: ${count} containers`);
  }

  // Check remaining for old names
  const remainingJbReceipts = await db.collection('warehousereceipts').countDocuments({ warehouse: jiuBianRegex });
  const remainingZbReceipts = await db.collection('warehousereceipts').countDocuments({ warehouse: zongBuRegex });
  const remainingJbWh = await db.collection('warehouses').countDocuments({ name: jiuBianRegex });
  const remainingZbWh = await db.collection('warehouses').countDocuments({ name: zongBuRegex });

  console.log('\nRemaining checks (all should be 0):');
  console.log(`  • 九边仓库 receipts: ${remainingJbReceipts}`);
  console.log(`  • 总部 receipts: ${remainingZbReceipts}`);
  console.log(`  • 九边仓库 warehouse doc: ${remainingJbWh}`);
  console.log(`  • 总部 warehouse doc: ${remainingZbWh}`);

  await mongoose.disconnect();
  console.log('\nMigration completed successfully!');
}

executeWarehouseTransferAndCleanup().catch((err) => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
