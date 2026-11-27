const mongoose = require('mongoose');
const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  const receipts = await mongoose.connection.collection('warehousereceipts').distinct('warehouse');
  console.log('Distinct warehouses in warehousereceipts:', receipts);

  const whDocs = await mongoose.connection.collection('warehouses').find({}).toArray();
  console.log('Warehouses in warehouses collection:', whDocs.map(w => ({ name: w.name, code: w.code })));

  const query = { receipt: { $in: ['RFN27NOV26', '261120002', '261123006', '261119038'] } };
  const sample = await mongoose.connection.collection('warehousereceipts').find(query).toArray();
  console.log('Sample matching receipts in DB:', sample.map(s => ({ receipt: s.receipt, warehouse: s.warehouse, warehouseEntry: s.warehouseEntry, qty: s.quantity, remaining: s.remainingQuantity })));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
