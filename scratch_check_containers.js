const mongoose = require('mongoose');
const uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function main() {
  await mongoose.connect(uri);
  const containers = await mongoose.connection.collection('containers').find({ container: { $in: ['USSI-329', 'USSI-299'] } }).toArray();
  console.log('Containers:', containers.map(c => ({
    container: c.container,
    eta: c.eta,
    destinationDate: c.destinationDate,
    status: c.status,
    isDelivered: c.isDelivered,
    deliveryDate: c.deliveryDate
  })));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
