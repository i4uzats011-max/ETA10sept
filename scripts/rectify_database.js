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

async function rectify() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('Connected to MongoDB for Database Rectification');

  const receipts = await mongoose.connection.db.collection('warehousereceipts').find({}).toArray();
  const shipments = await mongoose.connection.db.collection('shipments').find({}).toArray();

  // Map shipments strictly by receiptId and by warehouse composite key
  const shipmentsByReceiptId = new Map();
  const shipmentsByWhAndNum = new Map();

  for (const s of shipments) {
    if (!s.container || !s.container.trim()) continue; // Ignore if no container

    const qty = parseInt(String(s.quantity || 0), 10) || 0;
    const entry = {
      container: s.container.trim(),
      containerNumber: (s.containerNumber || '').trim(),
      quantity: qty,
      warehouse: (s.warehouse || '').trim().toUpperCase(),
    };

    if (s.receiptId) {
      const idKey = String(s.receiptId);
      if (!shipmentsByReceiptId.has(idKey)) shipmentsByReceiptId.set(idKey, []);
      shipmentsByReceiptId.get(idKey).push(entry);
    }
    if (s.receipt && s.warehouse) {
      const compositeKey = `${s.warehouse.trim().toUpperCase()}___${s.receipt.trim().toUpperCase()}`;
      if (!shipmentsByWhAndNum.has(compositeKey)) shipmentsByWhAndNum.set(compositeKey, []);
      shipmentsByWhAndNum.get(compositeKey).push(entry);
    }
  }

  let rectifiedCount = 0;
  let noContainerResetCount = 0;

  for (const r of receipts) {
    const idKey = String(r._id);
    const rWh = (r.warehouse || '').trim().toUpperCase();
    const compositeKey = `${rWh}___${(r.receipt || '').trim().toUpperCase()}`;

    // Valid attached containers strictly scoped to this warehouse
    let rawAttached = shipmentsByReceiptId.get(idKey);
    if (rawAttached && rWh) {
      rawAttached = rawAttached.filter((s) => !s.warehouse || s.warehouse === rWh);
    }
    const attachedShipments = (rawAttached && rawAttached.length > 0)
      ? rawAttached
      : (shipmentsByWhAndNum.get(compositeKey) || []);

    let totalLoadedWithContainer = 0;
    for (const item of attachedShipments) {
      totalLoadedWithContainer += item.quantity;
    }

    const totalQty = r.quantity || 0;
    let targetStatus = 'Received in Warehouse';
    let targetStockStatus = 'In Stock';
    let targetLoaded = 0;
    let targetRemaining = totalQty;

    // RULE: Only if container number / container is attached, show 'Partially Loaded' or 'Fully Loaded'
    if (attachedShipments.length > 0 && totalLoadedWithContainer > 0) {
      targetLoaded = totalLoadedWithContainer;
      targetRemaining = Math.max(0, totalQty - targetLoaded);
      if (targetLoaded >= totalQty && totalQty > 0) {
        targetStatus = 'Fully Loaded';
        targetStockStatus = 'Dispatched';
      } else {
        targetStatus = 'Partially Loaded';
        targetStockStatus = 'Partially Dispatched';
      }
    } else {
      // NO CONTAINER ATTACHED -> Must be 'Received in Warehouse' (Available)
      targetStatus = 'Received in Warehouse';
      targetStockStatus = 'In Stock';
      targetLoaded = 0;
      targetRemaining = totalQty;
    }

    const currentLoaded = r.loadedQuantity || 0;
    const currentStatus = r.status;

    if (
      currentLoaded !== targetLoaded ||
      r.remainingQuantity !== targetRemaining ||
      (currentStatus !== targetStatus && !(currentStatus === 'Received' && targetStatus === 'Received in Warehouse'))
    ) {
      if (attachedShipments.length === 0 && currentLoaded > 0) {
        noContainerResetCount++;
        console.log(`[NO CONTAINER JUNK FIXED] Receipt #${r.receipt} (${r.warehouse}): Had loaded ${currentLoaded} CTN with NO container -> Reset to 'Received in Warehouse' (${totalQty} CTN Available)`);
      }

      await mongoose.connection.db.collection('warehousereceipts').updateOne(
        { _id: r._id },
        {
          $set: {
            loadedQuantity: targetLoaded,
            remainingQuantity: targetRemaining,
            status: targetStatus,
            stockstatus: targetStockStatus,
            updatedAt: new Date(),
          },
        }
      );
      rectifiedCount++;
    }
  }

  console.log(`--- RECTIFICATION COMPLETE ---`);
  console.log(`Total receipts scanned: ${receipts.length}`);
  console.log(`Total receipts rectified: ${rectifiedCount}`);
  console.log(`Receipts reset because no container was attached: ${noContainerResetCount}`);

  const sample = await mongoose.connection.db.collection('warehousereceipts').findOne({ receipt: '260902006' });
  console.log('\nSample check for 260902006:');
  console.log({
    receipt: sample.receipt,
    warehouse: sample.warehouse,
    quantity: sample.quantity,
    loadedQuantity: sample.loadedQuantity,
    remainingQuantity: sample.remainingQuantity,
    status: sample.status,
    stockstatus: sample.stockstatus,
  });

  process.exit(0);
}

rectify().catch((err) => {
  console.error(err);
  process.exit(1);
});
