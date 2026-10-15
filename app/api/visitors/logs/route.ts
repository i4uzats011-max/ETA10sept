import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import VisitorLog from '@/models/VisitorLog';
import { isDeveloperAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Authenticate: Developer Admin or Super Admin only
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json({ error: 'Unauthorized. Developer Admin access required.' }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const search = (searchParams.get('search') || '').trim();
    const device = searchParams.get('device') || 'all';
    const country = (searchParams.get('country') || '').trim();
    const period = searchParams.get('period') || 'all';
    const filterIp = (searchParams.get('ip') || '').trim();

    const filter: any = {};

    // Period filter
    const now = new Date();
    if (period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filter.createdAt = { $gte: startOfDay };
    } else if (period === '24h') {
      filter.createdAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    } else if (period === '7d') {
      filter.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === '30d') {
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    // Device filter
    if (device === 'mobile') {
      filter.isMobile = true;
    } else if (device === 'desktop') {
      filter.isDesktop = true;
    } else if (device === 'tablet') {
      filter.isTablet = true;
    }

    // IP filter
    if (filterIp) {
      filter.ip = filterIp;
    }

    // Country filter
    if (country) {
      filter.country = { $regex: new RegExp(`^${country}$`, 'i') };
    }

    // General search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { ip: searchRegex },
        { city: searchRegex },
        { region: searchRegex },
        { country: searchRegex },
        { deviceModel: searchRegex },
        { brand: searchRegex },
        { browser: searchRegex },
        { os: searchRegex },
        { isp: searchRegex },
        { path: searchRegex },
        { referrer: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      VisitorLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VisitorLog.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('Error fetching visitor logs:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
