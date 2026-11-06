import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_jwt_secret_key_12345';
const COOKIE_NAME = 'admin_token';

export type UserRole = 'admin' | 'staff' | 'biller' | 'dispatcher' | 'developer';

export interface AdminPayload {
  role: UserRole;
  userId?: string;
  username?: string;
  name?: string;
  adminAccessGranted?: boolean;
  iat: number;
  exp: number;
}

export function signAdminToken(
  role: UserRole = 'admin',
  user?: { id?: string; username?: string; name?: string; adminAccessGranted?: boolean }
): string {
  const payload: any = { role };
  if (user?.id) payload.userId = user.id;
  if (user?.username) payload.username = user.username;
  if (user?.name) payload.name = user.name;
  if (role === 'developer') {
    // Developer inherently has all granted permissions
    payload.adminAccessGranted = true;
  } else if (user?.adminAccessGranted !== undefined) {
    payload.adminAccessGranted = Boolean(user.adminAccessGranted);
  } else {
    payload.adminAccessGranted = false;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAdminToken(token: string): AdminPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminPayload;
  } catch {
    return null;
  }
}

export function getAdminTokenFromRequest(req: NextRequest): string | null {
  // Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check Cookie header
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value) {
    return cookie.value;
  }

  return null;
}

/**
 * Developer Authentication:
 * STRICT RULE: Only Developer accounts have access to Developer Console / Telemetry.
 * No Admin, Employee, Biller, or Dispatcher can ever access Developer endpoints.
 */
export function isDeveloperAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  return payload !== null && payload.role === 'developer';
}

/**
 * Admin Authentication:
 * Developer has ALL access.
 * Admin role has access ONLY when Developer has granted access (adminAccessGranted === true).
 * Employees, Billers, Dispatchers are strictly blocked from Admin.
 */
export function isAdminAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  if (!payload) return false;

  // Developer has all access
  if (payload.role === 'developer') return true;

  // Admin has access ONLY when Developer has granted access
  if (payload.role === 'admin' && payload.adminAccessGranted === true) {
    return true;
  }

  return false;
}

/**
 * Super Admin Check:
 * Developer has super admin access.
 * Admin has super admin access ONLY when granted.
 */
export function isSuperAdminAuthenticated(req: NextRequest): boolean {
  return isAdminAuthenticated(req);
}

/**
 * Staff / Employee / Admin Authentication:
 * Employee has access to Employee View.
 * Admin (with access) and Developer also have access.
 */
export function isStaffOrAdminAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  if (!payload) return false;

  if (payload.role === 'developer') return true;
  if (payload.role === 'admin') return true;
  if (payload.role === 'staff') return true;

  return false;
}

/**
 * Biller Authentication:
 * Accessible by Developer (all access), Admin (all access except dev), Staff/Employee, and Biller.
 */
export function isBillerAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  if (!payload) return false;

  return (
    payload.role === 'developer' ||
    payload.role === 'admin' ||
    payload.role === 'staff' ||
    payload.role === 'biller'
  );
}

/**
 * Dispatcher Authentication:
 * Accessible by Developer (all access), Admin (all access except dev), Staff/Employee, and Dispatcher.
 */
export function isDispatcherAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  if (!payload) return false;

  return (
    payload.role === 'developer' ||
    payload.role === 'admin' ||
    payload.role === 'staff' ||
    payload.role === 'dispatcher'
  );
}

export function isAnyAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  return payload !== null;
}

export function getAuthenticatedUser(req: NextRequest): {
  username: string;
  role: string;
  name?: string;
  adminAccessGranted?: boolean;
} {
  const token = getAdminTokenFromRequest(req);
  if (!token) return { username: 'system', role: 'admin', adminAccessGranted: false };
  const payload = verifyAdminToken(token);
  if (!payload) return { username: 'system', role: 'admin', adminAccessGranted: false };
  return {
    username: payload.username || (payload.role === 'admin' ? 'admin' : payload.role),
    role: payload.role,
    name: payload.name,
    adminAccessGranted: payload.adminAccessGranted ?? (payload.role === 'developer'),
  };
}
