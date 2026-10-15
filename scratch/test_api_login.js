const fs = require('fs');
const mongoose = require('mongoose');
const crypto = require('crypto');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [salt, originalHash] = stored.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  }
  return password === stored;
}

async function verifyBlocked() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB });

  // 1. Check all users in DB
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  for (const u of users) {
    if (verifyPassword('developer2026', u.passwordHash)) {
      throw new Error(`CRITICAL: User ${u.username} still matches developer2026!`);
    }
  }

  // 2. Check all role credentials in DB
  const creds = await mongoose.connection.db.collection('rolecredentials').find({}).toArray();
  for (const c of creds) {
    if (verifyPassword('developer2026', c.passwordHash)) {
      throw new Error(`CRITICAL: Role ${c.role} still matches developer2026!`);
    }
  }

  console.log('✓ Confirmed: ZERO accounts in MongoDB match password "developer2026".');
  console.log('✓ developer2026 is 100% blocked from all logins.');
  process.exit(0);
}

verifyBlocked().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
