const mongoose = require('mongoose');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/MONGO_URI=(.*)/);
if (!match) {
  console.log('No MONGO_URI');
  process.exit(1);
}
const uri = match[1].trim();

mongoose.connect(uri).then(async () => {
  const receipts = await mongoose.connection.collection('warehousereceipts').find({
    warehouseEntry: { $exists: true, $ne: '' }
  }).limit(5).toArray();
  console.log('Sample with warehouseEntry:', receipts.map(r => ({ receipt: r.receipt, warehouse: r.warehouse, warehouseEntry: r.warehouseEntry })));
  
  const sampleAny = await mongoose.connection.collection('warehousereceipts').find().limit(5).toArray();
  console.log('Sample any:', sampleAny.map(r => ({ receipt: r.receipt, warehouse: r.warehouse, warehouseEntry: r.warehouseEntry })));

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
