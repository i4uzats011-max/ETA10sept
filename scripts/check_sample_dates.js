const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const uri = env.MONGO_URI || 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function test() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const sample = await db.collection('warehousereceipts').find({ date: { $exists: true, $ne: '' } }).project({ receipt: 1, date: 1, warehouse: 1 }).limit(10).toArray();
  console.log('Sample dates:', sample);
  await mongoose.disconnect();
}
test().catch(console.error);
