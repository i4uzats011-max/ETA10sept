import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import VisitorLog from '@/models/VisitorLog';
import { extractClientIp, lookupIpLocation } from '@/lib/geoip';
import { parseUserAgent } from '@/lib/deviceDetector';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawIp = extractClientIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    // Read payload
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty or beacon text
      body = {};
    }

    const {
      visitorId = 'anonymous_' + Math.random().toString(36).substring(2, 10),
      sessionCount = 1,
      path = '/',
      referrer = 'Direct',
      screenResolution = '',
      viewport = '',
      devicePixelRatio = 1,
      orientation = '',
      touchSupport = false,
      maxTouchPoints = 0,
      networkEffectiveType = '',
      language = '',
      clientTimezone = '',
    } = body;

    // Connect to database
    await connectToDatabase();

    // Deduplication check: if identical IP + path + visitorId logged within past 5 seconds, ignore to avoid spamming
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const recentDuplicate = await VisitorLog.findOne({
      ip: rawIp,
      path,
      visitorId,
      createdAt: { $gte: fiveSecondsAgo },
    }).select('_id').lean();

    if (recentDuplicate) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // Lookup IP Geolocation
    const geo = await lookupIpLocation(rawIp);

    // Parse Device & Mobile Details
    const device = parseUserAgent(userAgent, screenResolution);

    // Create visitor log document
    const logEntry = new VisitorLog({
      ip: rawIp,
      visitorId,
      sessionCount: Number(sessionCount) || 1,
      path: (path || '/').substring(0, 500),
      referrer: (referrer || 'Direct').substring(0, 500),
      userAgent: (userAgent || '').substring(0, 1000),

      // Location details
      country: geo.country,
      countryCode: geo.countryCode,
      region: geo.region,
      city: geo.city,
      postal: geo.postal,
      latitude: geo.latitude,
      longitude: geo.longitude,
      isp: geo.isp,
      org: geo.org,
      timezone: geo.timezone || clientTimezone || '',

      // Mobile & Device details
      deviceType: device.deviceType,
      isMobile: device.isMobile,
      isTablet: device.isTablet,
      isDesktop: device.isDesktop,
      brand: device.brand,
      model: device.model,
      os: device.os,
      osVersion: device.osVersion,
      browser: device.browser,
      browserVersion: device.browserVersion,

      // Client screen & environment details
      screenResolution: screenResolution ? String(screenResolution).substring(0, 50) : '',
      viewport: viewport ? String(viewport).substring(0, 50) : '',
      devicePixelRatio: Number(devicePixelRatio) || 1,
      orientation: orientation ? String(orientation).substring(0, 30) : '',
      touchSupport: Boolean(touchSupport),
      maxTouchPoints: Number(maxTouchPoints) || 0,
      networkEffectiveType: networkEffectiveType ? String(networkEffectiveType).substring(0, 20) : '',
      language: language ? String(language).substring(0, 50) : '',
    });

    await logEntry.save();

    return NextResponse.json({ success: true, id: logEntry._id });
  } catch (error: any) {
    console.error('Error in /api/visitors/log:', error);
    // Always return 200 so background tracking doesn't trigger console errors on visitor client
    return NextResponse.json({ success: false, error: error?.message || 'Logging error' }, { status: 200 });
  }
}
