import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import RoleCredential from '@/models/RoleCredential';
import { UserRole } from '@/lib/auth';

export const ALL_ROLES: UserRole[] = ['admin', 'developer', 'staff', 'biller', 'dispatcher'];

export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'developer':
      return 'Developer Admin';
    case 'admin':
      return 'Super Admin';
    case 'staff':
      return 'Internal Employee (Staff)';
    case 'biller':
      return 'Biller (बिलर)';
    case 'dispatcher':
      return 'Dispatcher (डिस्पैचर)';
    default:
      return role;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.includes(':')) {
    const [salt, originalHash] = stored.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  }
  // Direct match for legacy / plain stored passwords
  return password === stored;
}

export function isDefaultRolePassword(role: UserRole, candidate: string): boolean {
  switch (role) {
    case 'developer':
      if (candidate === 'developer2026') return false;
      return (
        candidate === (process.env.DEV_ADMIN_PASSWORD || '') ||
        candidate === (process.env.DEVELOPER_PASSWORD || '') ||
        candidate === 'Hello$1256'
      );
    case 'admin':
      return (
        candidate === (process.env.ADMIN_PASSWORD || '') ||
        candidate === 'Afsana1234'
      );
    case 'staff':
      return (
        candidate === (process.env.EADMIN_PASSWORD || '') ||
        candidate === (process.env.STAFF_PASSWORD || '') ||
        candidate === (process.env.ADMIN2_PASSWORD || '') ||
        candidate === 'Afsana4321'
      );
    case 'biller':
      return (
        candidate === (process.env.BILLER_PASSWORD || '') ||
        candidate === 'biller123'
      );
    case 'dispatcher':
      return (
        candidate === (process.env.DISPATCHER_PASSWORD || '') ||
        candidate === 'dispatch123'
      );
    default:
      return false;
  }
}

export async function verifyRolePassword(role: UserRole, candidatePassword: string): Promise<boolean> {
  if (!candidatePassword) return false;

  try {
    await connectToDatabase();
    const cred = await RoleCredential.findOne({ role }).lean();
    if (cred && cred.passwordHash) {
      return verifyPassword(candidatePassword, cred.passwordHash);
    }
  } catch (err) {
    console.warn(`[passwordManager] DB lookup failed for role ${role}, falling back to env:`, err);
  }

  // Fallback to default environment variable or preset passwords
  return isDefaultRolePassword(role, candidatePassword);
}

export async function setRolePassword(
  role: UserRole,
  newPassword: string,
  updatedBy: string
): Promise<void> {
  if (!newPassword || newPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  await connectToDatabase();
  const passwordHash = hashPassword(newPassword);
  const roleName = getRoleDisplayName(role);

  await RoleCredential.findOneAndUpdate(
    { role },
    {
      role,
      passwordHash,
      roleName,
      updatedBy,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export interface RoleStatusItem {
  role: UserRole;
  roleName: string;
  isCustom: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export async function getAllRolesStatus(): Promise<RoleStatusItem[]> {
  try {
    await connectToDatabase();
    const creds = await RoleCredential.find().lean();
    const credMap = new Map<string, any>();
    creds.forEach((c) => credMap.set(c.role, c));

    return ALL_ROLES.map((role) => {
      const found = credMap.get(role);
      return {
        role,
        roleName: getRoleDisplayName(role),
        isCustom: !!found,
        updatedAt: found?.updatedAt ? new Date(found.updatedAt).toISOString() : null,
        updatedBy: found?.updatedBy || null,
      };
    });
  } catch (err) {
    console.error('[passwordManager] Error getting roles status:', err);
    return ALL_ROLES.map((role) => ({
      role,
      roleName: getRoleDisplayName(role),
      isCustom: false,
      updatedAt: null,
      updatedBy: null,
    }));
  }
}
