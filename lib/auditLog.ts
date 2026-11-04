import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import EditLog, { AuditAction } from '@/models/EditLog';
import { connectToDatabase } from '@/lib/mongodb';

export interface LogCudOptions {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description: string;
  details?: Record<string, any>;
  username?: string;
  role?: string;
}

/**
 * Helper to record an Edit Log entry whenever any user performs a CUD (Create, Update, Delete) operation.
 */
export async function recordEditLog(req: NextRequest | null, options: LogCudOptions): Promise<void> {
  try {
    let username = options.username;
    let role = options.role;
    let ip = '';
    let userAgent = '';

    if (req) {
      if (!username || !role) {
        const user = getAuthenticatedUser(req);
        if (user) {
          username = username || user.username;
          role = role || user.role;
        }
      }
      ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        '';
      userAgent = req.headers.get('user-agent') || '';
    }

    username = username || 'admin';
    role = role || 'admin';

    await connectToDatabase();
    await EditLog.create({
      username,
      role,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId || '',
      description: options.description,
      details: options.details || null,
      ip,
      userAgent,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[EditLog Error] Failed to write audit edit log:', err);
  }
}
