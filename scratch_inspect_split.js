const mongoose = require('mongoose');
const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  const rNo = '260801029';
  const wh = await mongoose.connection.collection('warehousereceipts').findOne({ receipt: rNo });
  console.log('WH:', wh ? {
    receipt: wh.receipt,
    quantity: wh.quantity,
    loadedQuantity: wh.loadedQuantity,
    remainingQuantity: wh.remainingQuantity,
    status: wh.status,
    items: wh.items,
    goodsItems: wh.goodsItems,
    loadedItems: wh.loadedItems
  } : 'NOT FOUND');

  const ships = await mongoose.connection.collection('shipments').find({ receipt: rNo }).toArray();
  console.log('Shipments for', rNo, ':', ships.map(s => ({
    receipt: s.receipt,
    container: s.container,
    quantity: s.quantity,
    weight: s.weight,
    volume: s.volume,
    commodity: s.commodity,
    english: s.english,
    chinese: s.chinese,
    eta: s.eta,
    status: s.status,
    isSplit: s.isSplit,
    goodsItems: s.goodsItems
  })));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
