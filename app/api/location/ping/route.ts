import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAnyAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import UserLocation from '@/models/UserLocation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { latitude, longitude, accuracy, speed, heading, vehicleNumber, platform } = body;

    let userLabel = 'Guest User';
    let userRole = 'Field';
    let username = 'guest_' + (req.headers.get('x-forwarded-for') || 'anon').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 16);

    if (isAnyAuthenticated(req)) {
      try {
        const u = getAuthenticatedUser(req);
        username = u.username || username;
        userLabel = u.name || u.username;
        userRole = u.role || 'Staff';
      } catch {}
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      return NextResponse.json({ success: false, message: 'Invalid coordinates' }, { status: 400 });
    }

    const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const now = new Date();

    const updatedRecord = await UserLocation.findOneAndUpdate(
      { username },
      {
        $set: {
          username,
          name: userLabel,
          role: userRole,
          vehicleNumber: vehicleNumber || '',
          latitude: lat,
          longitude: lng,
          accuracy: Number(accuracy) || null,
          speed: speed !== undefined && speed !== null ? Number(speed) : null,
          heading: heading !== undefined && heading !== null ? Number(heading) : null,
          googleMapsUrl,
          platform: platform || 'mobile',
          isOnline: true,
          lastSeenAt: now,
        },
        $push: {
          history: {
            $each: [
              {
                latitude: lat,
                longitude: lng,
                accuracy: Number(accuracy) || null,
                speed: Number(speed) || null,
                heading: Number(heading) || null,
                timestamp: now,
              },
            ],
            $slice: -40, // Keep last 40 breadcrumbs
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      location: updatedRecord,
    });
  } catch (error: any) {
    console.error('Error saving user location:', error);
    return NextResponse.json({ error: error?.message || 'Failed to record location' }, { status: 500 });
  }
}

// GET: Return active users and their latest live coordinates for admin/management
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    // Return all users seen in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeLocations = await UserLocation.find({ lastSeenAt: { $gte: since } })
      .sort({ lastSeenAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: activeLocations.length,
      users: activeLocations,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load locations' }, { status: 500 });
  }
}
