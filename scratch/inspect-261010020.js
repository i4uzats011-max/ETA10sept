const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function check() {
  await mongoose.connect(uri);
  const wh = await mongoose.connection.collection('warehousereceipts').find({
    receipt: '261010020'
  }).toArray();
  console.log('WarehouseReceipts for 261010020 (total: ' + wh.length + '):');
  wh.forEach(w => console.log({
    _id: w._id,
    receipt: w.receipt,
    warehouse: w.warehouse,
    party: w.party,
    quantity: w.quantity,
    date: w.date,
    mainMarka: w.mainMarka,
    status: w.status,
    loadedQuantity: w.loadedQuantity,
    remainingQuantity: w.remainingQuantity
  }));

  const sh = await mongoose.connection.collection('shipments').find({
    receipt: '261010020'
  }).toArray();
  console.log('\nShipments for 261010020 (total: ' + sh.length + '):');
  sh.forEach(s => console.log({
    _id: s._id,
    receipt: s.receipt,
    receiptId: s.receiptId,
    warehouse: s.warehouse,
    party: s.party,
    container: s.container,
    quantity: s.quantity,
    eta: s.eta,
    status: s.status
  }));

  const links = await mongoose.connection.collection('receipttrackings').find({
    'receipts.receiptNo': '261010020'
  }).toArray();
  console.log('\nTracking Links containing 261010020:');
  links.forEach(l => {
    console.log({
      token: l.token,
      name: l.name,
      receipts: l.receipts.filter(r => r.receiptNo === '261010020')
    });
  });

  process.exit(0);
}
check();
