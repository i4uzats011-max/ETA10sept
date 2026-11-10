const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function test() {
  await mongoose.connect(uri);

  // We can simulate what resolveLiveReceiptsForTrackingDoc does
  const trackingDoc = await mongoose.connection.collection('receipttrackings').findOne({ token: 'trk_f48bce04058e' });

  const receiptNos = Array.from(new Set(trackingDoc.receipts.map(r => r.receiptNo)));
  const liveShipments = await mongoose.connection.collection('shipments').find({ receipt: { $in: receiptNos } }).toArray();
  const liveWhReceipts = await mongoose.connection.collection('warehousereceipts').find({ receipt: { $in: receiptNos } }).toArray();

  const shipmentsByReceipt = new Map();
  liveShipments.forEach(s => {
    const k = s.receipt.toLowerCase().trim();
    if (!shipmentsByReceipt.has(k)) shipmentsByReceipt.set(k, []);
    shipmentsByReceipt.get(k).push(s);
  });

  const whByReceipt = new Map();
  liveWhReceipts.forEach(w => {
    const k = w.receipt.toLowerCase().trim();
    if (!whByReceipt.has(k)) whByReceipt.set(k, []);
    whByReceipt.get(k).push(w);
  });

  console.log('--- Testing Resolution for trk_f48bce04058e ---');
  for (const entry of trackingDoc.receipts) {
    const rKey = entry.receiptNo.toLowerCase().trim();
    const whList = whByReceipt.get(rKey) || [];
    const allShipments = shipmentsByReceipt.get(rKey) || [];

    // Our new matching logic:
    let matchedWh = null;
    if (whList.length === 1) {
      matchedWh = whList[0];
    } else if (whList.length > 1) {
      if (entry.warehouseReceiptId) {
        matchedWh = whList.find(w => String(w._id) === String(entry.warehouseReceiptId));
      }
      if (!matchedWh && entry.warehouse) {
        matchedWh = whList.find(w => w.warehouse === entry.warehouse);
      }
      if (!matchedWh) {
        matchedWh = whList.find(w => w.quantity === parseFloat(entry.ctn));
      }
    }

    const rShipments = allShipments.filter(s => {
      if (matchedWh && s.receiptId && String(s.receiptId) === String(matchedWh._id)) return true;
      if (matchedWh && s.warehouse && s.warehouse === matchedWh.warehouse) return true;
      return false;
    });

    console.log(`Receipt #${entry.receiptNo}:`);
    console.log(`  Targeted Warehouse: ${matchedWh ? matchedWh.warehouse : 'None'}`);
    console.log(`  Shipments matched: ${rShipments.length}`);
    rShipments.forEach(s => console.log(`    -> Container: ${s.container}, CTN: ${s.quantity}, Marka: ${s.mainMarka}, Warehouse: ${s.warehouse}`));
  }

  process.exit(0);
}
test();
