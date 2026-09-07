import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_jwt_secret_key_12345';
const COOKIE_NAME = 'admin_token';

export interface AdminPayload {
  role: 'admin' | 'staff';
  iat: number;
  exp: number;
}

export function signAdminToken(role: 'admin' | 'staff' = 'admin'): string {
  return jwt.sign({ role }, JWT_SECRET, { expiresIn: '7d' });
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

export function isStaffOrAdminAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  return payload !== null && (payload.role === 'admin' || payload.role === 'staff');
}

export function isSuperAdminAuthenticated(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  const payload = verifyAdminToken(token);
  return payload !== null && payload.role === 'admin';
}

export function isAdminAuthenticated(req: NextRequest): boolean {
  return isStaffOrAdminAuthenticated(req);
}
