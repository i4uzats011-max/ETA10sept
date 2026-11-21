import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/lib/auth';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import ChinaSyncMismatch from '@/models/ChinaSyncMismatch';
import { runChinaWarehouseSync, fetchSingleReceiptFromChina, SyncMode } from '@/lib/chinaSyncEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const [
      gzTotal,
      ywTotal,
      gzVerified,
      ywVerified,
      pendingMismatchesCount,
      recentMismatches,
      lastSyncedReceipt,
    ] = await Promise.all([
      WarehouseReceipt.countDocuments({ warehouse: 'GZ' }),
      WarehouseReceipt.countDocuments({ warehouse: 'YW' }),
      WarehouseReceipt.countDocuments({ warehouse: 'GZ', isVerified: true }),
      WarehouseReceipt.countDocuments({ warehouse: 'YW', isVerified: true }),
      ChinaSyncMismatch.countDocuments({ status: 'PENDING' }),
      ChinaSyncMismatch.find({ status: 'PENDING' })
        .sort({ detectedAt: -1 })
        .limit(10)
        .lean(),
      WarehouseReceipt.findOne({ lastChinaSyncAt: { $ne: null } })
        .sort({ lastChinaSyncAt: -1 })
        .select('lastChinaSyncAt receipt warehouse')
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        gz: {
          total: gzTotal,
          verified: gzVerified,
          unverified: gzTotal - gzVerified,
        },
        yw: {
          total: ywTotal,
          verified: ywVerified,
          unverified: ywTotal - ywVerified,
        },
        pendingMismatchesCount,
        lastChinaSyncAt: (lastSyncedReceipt as any)?.lastChinaSyncAt || null,
      },
      recentMismatches,
    });
  } catch (err: any) {
    console.error('[API China Sync GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 1-Click Single Receipt Fetch from China Portal
    if (body.action === 'fetch_receipt' || (body.receipt && !body.mode)) {
      const receiptCode = String(body.receipt || '').trim();
      const warehouse = (body.warehouse as 'GZ' | 'YW' | 'ALL') || 'ALL';
      const singleRes = await fetchSingleReceiptFromChina(receiptCode, warehouse);
      if (!singleRes.success) {
        return NextResponse.json({ success: false, error: singleRes.message }, { status: 404 });
      }
      return NextResponse.json(singleRes);
    }

    const mode = (body.mode as SyncMode) || 'sync';
    const warehouse = (body.warehouse as 'GZ' | 'YW' | 'ALL') || 'ALL';
    const daysBack = body.daysBack !== undefined ? parseInt(String(body.daysBack), 10) : undefined;
    const startDate = body.startDate ? String(body.startDate).trim() : undefined;
    const endDate = body.endDate ? String(body.endDate).trim() : undefined;

    const result = await runChinaWarehouseSync({
      mode,
      warehouse,
      daysBack,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      message: `Sync execution completed (${mode})`,
      result,
    });
  } catch (err: any) {
    console.error('[API China Sync POST] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Sync execution failed' },
      { status: 500 }
    );
  }
}
