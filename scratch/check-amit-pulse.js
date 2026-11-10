const mongoose = require('mongoose');
const fs = require('fs');

const envText = fs.readFileSync('C:/Users/USER/Desktop/New folder/anti/.env', 'utf8');
const match = envText.match(/MONGO_URI=(.*)/);
const uri = match ? match[1].trim() : '';

async function check() {
  await mongoose.connect(uri);
  const doc = await mongoose.connection.collection('receipttrackings').findOne({ token: 'trk_f48bce04058e' });
  console.log('Token:', doc.token, 'Name:', doc.name);
  console.log('Receipts in doc:');
  doc.receipts.forEach(r => console.log(r));
  process.exit(0);
}
check();
