const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let uri = 'mongodb+srv://i4uzats011_db_user:K7X5BETnFdTgTgTE@cluster0.2gn7lxt.mongodb.net/cargo_tracker_v2?appName=Cluster0';
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && match[1].trim() === 'MONGO_URI') {
      uri = match[2].trim();
    }
  });
} catch (e) {}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const roleCredentials = db.collection('rolecredentials');

  const pwHash = hashPassword('opshead123');

  // Upsert 'operationshead'
  await users.updateOne(
    { username: 'operationshead' },
    {
      $set: {
        username: 'operationshead',
        name: 'Operations Head',
        passwordHash: pwHash,
        plainPasswordView: 'opshead123',
        role: 'operations_head',
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

  // Also upsert 'operations_head'
  await users.updateOne(
    { username: 'operations_head' },
    {
      $set: {
        username: 'operations_head',
        name: 'Operations Head',
        passwordHash: pwHash,
        plainPasswordView: 'opshead123',
        role: 'operations_head',
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

  // Role credentials entry
  await roleCredentials.updateOne(
    { role: 'operations_head' },
    {
      $set: {
        role: 'operations_head',
        roleName: 'Operations Head (ऑपरेशन हेड)',
        passwordHash: pwHash,
        updatedBy: 'system',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      }
    },
    { upsert: true }
  );

  console.log('✅ Operations Head account initialized successfully!');
  console.log('Username: operationshead (or operations_head)');
  console.log('Password: opshead123');
  console.log('Portal URL: /operations');
  process.exit(0);
}

run().catch(err => {
  console.error('Failed to setup operations head user:', err);
  process.exit(1);
});
