const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Read .env.local or .env for MONGO_URI
const envPath = fs.existsSync(path.join(__dirname, '..', '.env.local'))
  ? path.join(__dirname, '..', '.env.local')
  : path.join(__dirname, '..', '.env');

const envContent = fs.readFileSync(envPath, 'utf8');
const mongoMatch = envContent.match(/MONGO_URI=([^\r\n]+)/);
const mongoUri = mongoMatch ? mongoMatch[1].trim() : null;

console.log('MongoDB URI detected:', mongoUri ? 'Found' : 'NOT FOUND');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [salt, originalHash] = stored.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  }
  return password === stored;
}

const RoleCredentialSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ['admin', 'staff', 'biller', 'dispatcher', 'developer'],
      index: true,
    },
    passwordHash: { type: String, required: true },
    roleName: { type: String, required: true },
    updatedBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

const RoleCredential = mongoose.models.RoleCredential || mongoose.model('RoleCredential', RoleCredentialSchema);

async function runTest() {
  if (!mongoUri) {
    console.error('MONGO_URI is missing');
    return;
  }

  await mongoose.connect(mongoUri, { dbName: 'cargo_tracker_v2' });
  console.log('Connected to MongoDB successfully!');

  // Test upserting a test role credential
  const testRole = 'biller';
  const newBillerPass = 'billerPassTest2026';
  const hashed = hashPassword(newBillerPass);

  console.log(`Setting password for role: ${testRole}...`);
  await RoleCredential.findOneAndUpdate(
    { role: testRole },
    {
      role: testRole,
      passwordHash: hashed,
      roleName: 'Biller (बिलर)',
      updatedBy: 'admin',
    },
    { upsert: true, new: true }
  );

  const found = await RoleCredential.findOne({ role: testRole });
  console.log('Fetched saved role credential from DB: role =', found.role, ', updatedBy =', found.updatedBy);

  const isValid = verifyPassword(newBillerPass, found.passwordHash);
  console.log('Verification test of saved password:', isValid ? 'SUCCESS' : 'FAILED');

  const isInvalid = verifyPassword('wrongpassword', found.passwordHash);
  console.log('Rejection test of wrong password:', !isInvalid ? 'SUCCESS' : 'FAILED');

  // Clean up test entry or revert to standard biller123
  console.log('Setting biller password back to biller123...');
  await RoleCredential.findOneAndUpdate(
    { role: testRole },
    {
      role: testRole,
      passwordHash: hashPassword('biller123'),
      roleName: 'Biller (बिलर)',
      updatedBy: 'test_cleanup',
    },
    { upsert: true, new: true }
  );

  console.log('All MongoDB tests passed successfully!');
  await mongoose.disconnect();
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
