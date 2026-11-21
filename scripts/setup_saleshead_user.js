const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const uri = env.MONGO_URI || 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const users = db.collection('users');

  const pwHash = hashPassword('saleshead123');

  // Upsert 'saleshead'
  await users.updateOne(
    { username: 'saleshead' },
    {
      $set: {
        username: 'saleshead',
        name: 'Sales Head',
        passwordHash: pwHash,
        plainPasswordView: 'saleshead123',
        role: 'sales_head',
        isActive: true,
        adminAccessGranted: false,
        createdBy: 'system',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      }
    },
    { upsert: true }
  );

  // Also upsert 'sales_head'
  await users.updateOne(
    { username: 'sales_head' },
    {
      $set: {
        username: 'sales_head',
        name: 'Sales Head',
        passwordHash: pwHash,
        plainPasswordView: 'saleshead123',
        role: 'sales_head',
        isActive: true,
        adminAccessGranted: false,
        createdBy: 'system',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      }
    },
    { upsert: true }
  );

  console.log('Successfully set up Sales Head credentials in database:');
  console.log('Username: saleshead (or sales_head)');
  console.log('Password: saleshead123');

  await mongoose.disconnect();
}

run().catch(console.error);
