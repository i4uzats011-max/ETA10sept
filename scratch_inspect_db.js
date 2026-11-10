const mongoose = require('mongoose');
const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  
  // Find warehouse receipts with multiple items
  const multiItemWh = await mongoose.connection.collection('warehousereceipts').find({
    $expr: { $gt: [{ $size: { $ifNull: ['$items', []] } }, 1] }
  }).limit(5).toArray();
  console.log('Multi-item Warehouse Receipts count/sample:', multiItemWh.length);
  if (multiItemWh.length > 0) {
    console.log('Sample WH with multi items:', {
      receipt: multiItemWh[0].receipt,
      items: multiItemWh[0].items
    });
  }

  // Find split shipments (same receipt in multiple shipments)
  const splitShipments = await mongoose.connection.collection('shipments').aggregate([
    { $group: { _id: '$receipt', count: { $sum: 1 }, containers: { $push: '$container' } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 }
  ]).toArray();
  console.log('Split shipments sample (same receipt loaded in multiple containers):', splitShipments);

  // Find all tracking documents
  const trackingDocs = await mongoose.connection.collection('receipttrackings').find({}).toArray();
  console.log('Total tracking docs in DB:', trackingDocs.length);
  trackingDocs.forEach(d => {
    console.log(`- Token: ${d.token}, Name: ${d.name}, Receipts: ${(d.receipts || []).map(r => r.receiptNo).join(', ')}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
