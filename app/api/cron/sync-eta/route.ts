import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import SyncError from '@/models/SyncError';
import { shouldSyncContainer, fetchContainerTracking } from '@/lib/jsoncargo';

export const dynamic = 'force-dynamic';
import { isAdminAuthenticated } from '@/lib/auth';

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(req: NextRequest) {
  // Authorization check: Bearer CRON_SECRET, x-vercel-cron header, ?secret= query, or Admin session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'cron_secret_bearer_token_998877';
  const querySecret = req.nextUrl?.searchParams?.get('secret');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const isCronAuthorized =
    isVercelCron ||
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret;
  const isAdmin = isAdminAuthenticated(req);

  if (!isCronAuthorized && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized cron execution' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // Fetch distinct container numbers with carrier assignments
    const sampleShipments = await Shipment.aggregate([
      {
        $match: {
          containerNumber: { $exists: true, $nin: ['', 'Default', null] },
        },
      },
      {
        $group: {
          _id: '$containerNumber',
          container: { $first: '$container' },
          shippingLine: { $first: '$shippingLine' },
          eta: { $first: '$eta' },
          status: { $first: '$status' },
          lastApiSync: { $first: '$lastApiSync' },
          count: { $sum: 1 },
        },
      },
    ]);

    const now = new Date();
    let syncedCount = 0;
    let skippedCount = 0;
    const syncResults: any[] = [];

    for (const group of sampleShipments) {
      const containerNumber = group._id;
      const containerAlias = group.container || containerNumber;
      const shippingLine = group.shippingLine || 'Default';
      const eta = group.eta;
      const status = group.status;
      const lastApiSync = group.lastApiSync ? new Date(group.lastApiSync) : null;

      // Evaluate against the defined parameter schedule (Daily for 1-5d, 2d for 5-11d, 5d for 11-17d, etc.)
      if (shouldSyncContainer(lastApiSync, eta, now, status)) {
        try {
          const tracking = await fetchContainerTracking(containerNumber, shippingLine);

          await Shipment.updateMany(
            { containerNumber },
            {
              $set: {
                eta: tracking.eta,
                status: tracking.status,
                shippedFrom: tracking.shippedFrom,
                shippedTo: tracking.shippedTo,
                currentLocation: tracking.currentLocation,
                startDate: tracking.startDate,
                destinationDate: tracking.destinationDate,
                vesselName: tracking.vesselName,
                voyageNumber: tracking.voyageNumber,
                jsonCargoData: tracking.dataDetails,
                lastApiSync: now,
              },
            }
          );

          if (containerAlias) {
            await Container.findOneAndUpdate(
              { container: containerAlias },
              {
                $set: {
                  container: containerAlias,
                  containerNumber,
                  shippingLine,
                  eta: tracking.eta,
                  status: tracking.status,
                  shippedFrom: tracking.shippedFrom,
                  shippedTo: tracking.shippedTo,
                  currentLocation: tracking.currentLocation,
                  startDate: tracking.startDate,
                  destinationDate: tracking.destinationDate,
                  vesselName: tracking.vesselName,
                  voyageNumber: tracking.voyageNumber,
                  jsonCargoData: tracking.dataDetails,
                  shipmentCount: group.count,
                  lastApiSync: now,
                },
              },
              { upsert: true, new: true }
            );
          }

          syncedCount++;
          syncResults.push({
            containerNumber,
            shippingLine,
            previousEta: eta,
            newEta: tracking.eta,
            newStatus: tracking.status,
            status: 'Synced',
          });
        } catch (err: any) {
          // Log failed sync to SyncError collection
          try {
            await SyncError.create({
              container: containerAlias || 'N/A',
              containerNumber,
              shippingLine,
              errorMessage: err?.message || 'API sync failed during cron',
              source: 'cron',
            });
          } catch (logErr) {
            console.error('Failed to log cron SyncError:', logErr);
          }

          syncResults.push({
            containerNumber,
            shippingLine,
            previousEta: eta,
            status: 'Failed',
            error: err?.message || 'API sync failed',
          });
        }
      } else {
        skippedCount++;
        syncResults.push({
          containerNumber,
          lastApiSync,
          eta,
          status: 'Skipped (Within parameter frequency window)',
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      syncedCount,
      skippedCount,
      totalContainers: sampleShipments.length,
      details: syncResults,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Cron ETA Sync failed' },
      { status: 500 }
    );
  }
}
