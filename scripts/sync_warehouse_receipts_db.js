const mongoose = require('mongoose');
const fs = require('fs');

const uri = process.env.MONGO_URI || 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function syncDb() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const whReceipts = await db.collection('warehousereceipts').find({}).toArray();
  const shipments = await db.collection('shipments').find({}).toArray();

  const shipmentsByReceiptWh = new Map();
  for (const s of shipments) {
    const r = (s.receipt || '').trim().toLowerCase();
    const wh = (s.warehouse || '').trim().toUpperCase();
    const key = wh ? r + '___' + wh : r;
    if (!shipmentsByReceiptWh.has(key)) shipmentsByReceiptWh.set(key, []);
    shipmentsByReceiptWh.get(key).push(s);
  }

  const updatedRecords = [];

  for (const w of whReceipts) {
    const r = (w.receipt || '').trim().toLowerCase();
    const wh = (w.warehouse || '').trim().toUpperCase();
    const key = wh ? r + '___' + wh : r;
    const ships = shipmentsByReceiptWh.get(key) || shipmentsByReceiptWh.get(r) || [];

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
