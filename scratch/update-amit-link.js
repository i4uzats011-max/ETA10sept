const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function updateLink() {
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('receipttrackings');
  
  // Set warehouse: 'GZ' on receipts in trk_f48bce04058e
  const res = await col.updateOne(
    { token: 'trk_f48bce04058e', 'receipts.receiptNo': '261010020' },
    {
      $set: {
        'receipts.$.warehouse': 'GZ',
        'receipts.$.warehouseReceiptId': '6ac9de73076069b4947d4d71'
      }
    }
  );
  console.log('Update result for trk_f48bce04058e:', res);

  const updatedDoc = await col.findOne({ token: 'trk_f48bce04058e' });
  console.log('Updated receipt in doc:');
  const r26 = updatedDoc.receipts.find(r => r.receiptNo === '261010020');
  console.log(r26);

  process.exit(0);
}
updateLink();
