const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

function loadEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).replace(/^['"]|['"]$/g, '').trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

async function registerWarehouse() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const res = await db.collection('warehouses').findOneAndUpdate(
    { name: { $regex: /^YW-55$/i } },
    {
      $set: {
        name: 'YW-55',
        code: 'YW-55',
        city: 'Yiwu',
        address: 'China Yiwu Warehouse (UID: YW-55)',
        contact: '13858879985',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log('Successfully registered / updated YW-55 warehouse:', res);
  await mongoose.disconnect();
}

registerWarehouse().catch((err) => {
  console.error('Error registering warehouse:', err);
  process.exit(1);
});
