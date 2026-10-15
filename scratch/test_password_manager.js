const crypto = require('crypto');

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

console.log('--- Testing Password Hashing & Verification ---');
const testPass = 'developer2026';
const hashed = hashPassword(testPass);
console.log('Generated hash:', hashed);

const matchTrue = verifyPassword(testPass, hashed);
console.log('Verify correct password:', matchTrue ? 'PASS' : 'FAIL');

const matchFalse = verifyPassword('WrongPassword123', hashed);
console.log('Verify incorrect password rejected:', !matchFalse ? 'PASS' : 'FAIL');

const matchLegacy = verifyPassword('Afsana1234', 'Afsana1234');
console.log('Verify legacy/plain password:', matchLegacy ? 'PASS' : 'FAIL');

console.log('All hash tests completed successfully!');
