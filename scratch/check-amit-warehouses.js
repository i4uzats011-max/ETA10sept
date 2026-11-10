const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function check() {
  await mongoose.connect(uri);
  const doc = await mongoose.connection.collection('receipttrackings').findOne({ token: 'trk_f48bce04058e' });
  for (const r of doc.receipts) {
    const wh = await mongoose.connection.collection('warehousereceipts').find({ receipt: r.receiptNo }).toArray();
    console.log(`Receipt: ${r.receiptNo} (${r.marka}):`, wh.map(w => ({ warehouse: w.warehouse, quantity: w.quantity, marka: w.mainMarka })));
  }
  process.exit(0);
}
check();
