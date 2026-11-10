const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function test() {
  await mongoose.connect(uri);

  const trackingDoc = await mongoose.connection.collection('receipttrackings').findOne({
    token: 'trk_f48bce04058e'
  });

  // Test with TS / JS resolver
  console.log('Testing doc receipts:');
  trackingDoc.receipts.forEach(r => console.log({ receiptNo: r.receiptNo, marka: r.marka, ctn: r.ctn }));

  process.exit(0);
}
test();
