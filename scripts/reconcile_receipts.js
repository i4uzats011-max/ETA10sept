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

async function reconcile() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const receipts = await mongoose.connection.db.collection('warehousereceipts').find({}).toArray();
  const shipments = await mongoose.connection.db.collection('shipments').find({}).toArray();

  const shipmentSumByReceiptId = {};
  for (const s of shipments) {
    const qty = parseInt(String(s.quantity || 0), 10) || 0;
    if (s.receiptId) {
      const idStr = String(s.receiptId);
      shipmentSumByReceiptId[idStr] = (shipmentSumByReceiptId[idStr] || 0) + qty;
    }
  }

  let updatedCount = 0;
  for (const r of receipts) {
    const idStr = String(r._id);
    const actualLoaded = shipmentSumByReceiptId[idStr] || 0;
    const currentLoaded = r.loadedQuantity || 0;

    if (actualLoaded !== currentLoaded) {
      const newRemaining = Math.max(0, (r.quantity || 0) - actualLoaded);
      let newStatus = 'Received';
      let newStockStatus = 'In Stock';
      if (actualLoaded >= r.quantity && r.quantity > 0) {
        newStatus = 'Fully Loaded';
        newStockStatus = 'Dispatched';
      } else if (actualLoaded > 0) {
        newStatus = 'Partially Loaded';
        newStockStatus = 'Partially Dispatched';
      }

      await mongoose.connection.db.collection('warehousereceipts').updateOne(
        { _id: r._id },
        {
          $set: {
            loadedQuantity: actualLoaded,
            remainingQuantity: newRemaining,
            status: newStatus,
            stockstatus: newStockStatus,
            updatedAt: new Date(),
          }
        }
      );
      updatedCount++;
      console.log(`Fixed Receipt #${r.receipt} (${r.warehouse}): loaded ${currentLoaded} -> ${actualLoaded}, rem ${newRemaining}, status '${newStatus}'`);
    }
  }

  console.log(`Successfully reconciled ${updatedCount} receipt(s)!`);

  const rec26 = await mongoose.connection.db.collection('warehousereceipts').findOne({ receipt: '260902006' });
  console.log('Receipt 260902006 status now:', {
    receipt: rec26.receipt,
    warehouse: rec26.warehouse,
    quantity: rec26.quantity,
    loadedQuantity: rec26.loadedQuantity,
    remainingQuantity: rec26.remainingQuantity,
    status: rec26.status,
    stockstatus: rec26.stockstatus
  });

  process.exit(0);
}

reconcile().catch((err) => {
  console.error(err);
  process.exit(1);
});
