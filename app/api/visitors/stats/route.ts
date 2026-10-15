import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import VisitorLog from '@/models/VisitorLog';
import { isDeveloperAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!isDeveloperAuthenticated(req)) {
      return NextResponse.json({ error: 'Unauthorized. Developer Admin access required.' }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'all';

    const matchFilter: any = {};
    const now = new Date();

    if (period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      matchFilter.createdAt = { $gte: startOfDay };
    } else if (period === '24h') {
      matchFilter.createdAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    } else if (period === '7d') {
      matchFilter.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === '30d') {
      matchFilter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    // 1. Overall Totals
    const totalVisits = await VisitorLog.countDocuments(matchFilter);

    // 2. Unique IPs and Unique Visitors
    const uniqueIpsCount = (await VisitorLog.distinct('ip', matchFilter)).length;
    const uniqueVisitorsCount = (await VisitorLog.distinct('visitorId', matchFilter)).length;

    // 3. Device Breakdown (Mobile vs Desktop vs Tablet)
    const deviceBreakdown = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$deviceType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    let mobileCount = 0;
    let desktopCount = 0;
    let tabletCount = 0;
    let otherCount = 0;

    deviceBreakdown.forEach((item) => {
      if (item._id === 'mobile') mobileCount += item.count;
      else if (item._id === 'desktop') desktopCount += item.count;
      else if (item._id === 'tablet') tabletCount += item.count;
      else otherCount += item.count;
    });

    // 4. Distinct IP Address Summary with visit counts & latest location
    // Directly solves "how many and also their ip address"
    const topIpAddresses = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$ip',
          visitCount: { $sum: 1 },
          lastSeen: { $max: '$createdAt' },
          country: { $last: '$country' },
          city: { $last: '$city' },
          isp: { $last: '$isp' },
          latestDevice: { $last: '$model' },
          isMobile: { $last: '$isMobile' },
          browser: { $last: '$browser' },
        },
      },
      { $sort: { visitCount: -1 } },
      { $limit: 100 },
      {
        $project: {
          ip: '$_id',
          visitCount: 1,
          lastSeen: 1,
          country: 1,
          city: 1,
          isp: 1,
          latestDevice: 1,
          isMobile: 1,
          browser: 1,
        },
      },
    ]);

    // 5. Top Mobile Models / Brands
    const topMobileBrands = await VisitorLog.aggregate([
      { $match: { ...matchFilter, isMobile: true } },
      {
        $group: {
          _id: '$brand',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const topMobileModels = await VisitorLog.aggregate([
      { $match: { ...matchFilter, isMobile: true } },
      {
        $group: {
          _id: '$model',
          count: { $sum: 1 },
          brand: { $first: '$brand' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // 6. Top Locations (Countries & Cities)
    const topCountries = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
          countryCode: { $first: '$countryCode' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    const topCities = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { city: '$city', country: '$country' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
      {
        $project: {
          city: '$_id.city',
          country: '$_id.country',
          count: 1,
        },
      },
    ]);

    // 7. Top Operating Systems & Browsers
    const topOs = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$os',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    const topBrowsers = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$browser',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    // 8. Top Visited Pages
    const topPages = await VisitorLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$path',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return NextResponse.json({
      success: true,
      summary: {
        totalVisits,
        uniqueIpsCount,
        uniqueVisitorsCount,
        mobileCount,
        desktopCount,
        tabletCount,
        otherCount,
        mobilePercentage: totalVisits > 0 ? Math.round((mobileCount / totalVisits) * 100) : 0,
        desktopPercentage: totalVisits > 0 ? Math.round((desktopCount / totalVisits) * 100) : 0,
      },
      topIpAddresses,
      topMobileBrands,
      topMobileModels,
      topCountries,
      topCities,
      topOs,
      topBrowsers,
      topPages,
    });
  } catch (error: any) {
    console.error('Error fetching visitor stats:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
