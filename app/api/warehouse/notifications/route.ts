import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import MarkaAddress from '@/models/MarkaAddress';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import { formatGlobalDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// GET: Fetch Inward Receipts for Party Arrival Notifications
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date')?.trim();
    const searchParam = searchParams.get('search')?.trim();
    const statusParam = searchParams.get('status')?.trim(); // 'all' | 'pending' | 'sent'
    const warehouseParam = searchParams.get('warehouse')?.trim();

    // 1. Fetch all distinct receipt dates available in the system
    const rawDistinctDates = await WarehouseReceipt.distinct('date');
    const validDates = rawDistinctDates
      .filter((d): d is string => Boolean(d && typeof d === 'string' && d.trim()))
      .map((d) => d.trim());

    // Sort distinct dates descending
    const sortedDistinctDates = Array.from(new Set(validDates)).sort((a, b) => b.localeCompare(a));

    // Determine query filter
    const query: Record<string, any> = {};

    if (dateParam && dateParam !== 'ALL') {
      const escapedDate = dateParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.date = new RegExp(`^${escapedDate}`, 'i');
    }

    if (warehouseParam && warehouseParam !== 'ALL') {
      const escapedWh = warehouseParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.warehouse = new RegExp(`^${escapedWh}$`, 'i');
    }

    if (statusParam === 'pending') {
      query.messageSent = { $ne: true };
    } else if (statusParam === 'sent') {
      query.messageSent = true;
    }

    if (searchParam) {
      const escaped = searchParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { receipt: regex },
        { mainMarka: regex },
        { subMarka: regex },
        { party: regex },
        { english: regex },
        { commodity: regex },
        { phone: regex },
        { partyPhone: regex },
      ];
    }

    const receipts = await WarehouseReceipt.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(2000)
      .lean();

    // 2. Fetch all MarkaAddress records to auto-populate party mobile numbers for marks missing phone
    const marksNeedingPhone = Array.from(
      new Set(
        receipts
          .filter((r: any) => !r.phone && !r.partyPhone && (r.mainMarka || r.subMarka))
          .map((r: any) => (r.mainMarka || r.subMarka || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const markaDirectory = new Map<string, string>();
    if (marksNeedingPhone.length > 0) {
      const markaDocs = await MarkaAddress.find({
        marka: { $in: marksNeedingPhone.map((m) => new RegExp(`^${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
      }).select('marka phone').lean();

      for (const m of markaDocs) {
        if (m.phone && m.phone.trim()) {
          markaDirectory.set(m.marka.toUpperCase().trim(), m.phone.trim());
        }
      }
    }

    // Also populate stats for the selected date / filter
    let totalCartons = 0;
    let totalWeight = 0;
    let totalVolume = 0;
    let pendingCount = 0;
    let sentCount = 0;

    const formattedReceipts = receipts.map((r: any) => {
      const markKey = (r.mainMarka || r.subMarka || '').trim().toUpperCase();
      const resolvedPhone = r.phone || r.partyPhone || markaDirectory.get(markKey) || '';

      const isSent = Boolean(r.messageSent);
      if (isSent) {
        sentCount++;
      } else {
        pendingCount++;
      }

      const q = parseInt(String(r.quantity || 0), 10);
      if (!isNaN(q)) totalCartons += q;

      const wt = parseFloat(String(r.weight || 0));
      if (!isNaN(wt)) totalWeight += wt;

      const vol = parseFloat(String(r.volume || 0));
      if (!isNaN(vol)) totalVolume += vol;

      return {
        _id: String(r._id),
        receipt: r.receipt || '',
        warehouse: r.warehouse || 'RS-21 Warehouse',
        date: r.date || '',
        mainMarka: r.mainMarka || '',
        subMarka: r.subMarka || '',
        party: r.party || '',
        english: r.english || r.commodity || '',
        commodity: r.commodity || '',
        chinese: r.chinese || '',
        quantity: r.quantity || 0,
        weight: r.weight || '0',
        volume: r.volume || '0',
        phone: resolvedPhone,
        messageSent: isSent,
        messageSentAt: r.messageSentAt ? new Date(r.messageSentAt).toISOString() : null,
        messageSentDate: r.messageSentDate || (r.messageSentAt ? formatGlobalDate(r.messageSentAt) : ''),
      };
    });

    return NextResponse.json({
      success: true,
      receipts: formattedReceipts,
      distinctDates: sortedDistinctDates,
      stats: {
        total: formattedReceipts.length,
        pending: pendingCount,
        sent: sentCount,
        totalCartons,
        totalWeight: Math.round(totalWeight * 100) / 100,
        totalVolume: Math.round(totalVolume * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error('Error fetching notification receipts:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch notification receipts' },
      { status: 500 }
    );
  }
}

// POST: Manage Notification Actions (mark-sent, mark-unsent, save-mobile)
export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { action } = body;

    // ACTION 1: Mark Message as Sent & Record Timestamp
    if (action === 'mark-sent') {
      const { receiptId, receiptIds, receipt, warehouse } = body;
      const now = new Date();
      const dateFormatted = formatGlobalDate(now);
      const nowIso = now.toISOString();

      if (Array.isArray(receiptIds) && receiptIds.length > 0) {
        await WarehouseReceipt.updateMany(
          { _id: { $in: receiptIds } },
          {
            $set: {
              messageSent: true,
              messageSentAt: now,
              messageSentDate: dateFormatted,
            },
          }
        );
        return NextResponse.json({
          success: true,
          messageSent: true,
          messageSentAt: nowIso,
          messageSentDate: dateFormatted,
          updatedCount: receiptIds.length,
        });
      }

      if (receiptId) {
        await WarehouseReceipt.findByIdAndUpdate(receiptId, {
          $set: {
            messageSent: true,
            messageSentAt: now,
            messageSentDate: dateFormatted,
          },
        });
      } else if (receipt) {
        const query: Record<string, any> = { receipt: receipt.trim() };
        if (warehouse) query.warehouse = warehouse.trim();
        await WarehouseReceipt.updateMany(query, {
          $set: {
            messageSent: true,
            messageSentAt: now,
            messageSentDate: dateFormatted,
          },
        });
      } else {
        return NextResponse.json({ error: 'Receipt identifier required' }, { status: 400 });
      }

      // Also sync to matching Shipment documents if any
      if (receipt) {
        await Shipment.updateMany(
          { receipt: receipt.trim() },
          {
            $set: {
              messageSent: true,
              messageSentAt: now,
              messageSentDate: dateFormatted,
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        messageSent: true,
        messageSentAt: nowIso,
        messageSentDate: dateFormatted,
      });
    }

    // ACTION 2: Mark Message as Unsent
    if (action === 'mark-unsent') {
      const { receiptId, receiptIds, receipt } = body;

      if (Array.isArray(receiptIds) && receiptIds.length > 0) {
        await WarehouseReceipt.updateMany(
          { _id: { $in: receiptIds } },
          {
            $set: {
              messageSent: false,
              messageSentAt: null,
              messageSentDate: '',
            },
          }
        );
        return NextResponse.json({ success: true, messageSent: false });
      }

      if (receiptId) {
        await WarehouseReceipt.findByIdAndUpdate(receiptId, {
          $set: {
            messageSent: false,
            messageSentAt: null,
            messageSentDate: '',
          },
        });
      } else if (receipt) {
        await WarehouseReceipt.updateMany(
          { receipt: receipt.trim() },
          {
            $set: {
              messageSent: false,
              messageSentAt: null,
              messageSentDate: '',
            },
          }
        );
      }

      return NextResponse.json({ success: true, messageSent: false });
    }

    // ACTION 3: Save Party Mobile Number For Future Reference
    if (action === 'save-mobile') {
      const { receiptId, receipt, marka, party, phone } = body;
      const cleanPhone = String(phone || '').trim();

      if (!cleanPhone) {
        return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
      }

      // 1. Update this Warehouse Receipt
      if (receiptId) {
        await WarehouseReceipt.findByIdAndUpdate(receiptId, {
          $set: {
            phone: cleanPhone,
            partyPhone: cleanPhone,
          },
        });
      } else if (receipt) {
        await WarehouseReceipt.updateMany(
          { receipt: receipt.trim() },
          {
            $set: {
              phone: cleanPhone,
              partyPhone: cleanPhone,
            },
          }
        );
      }

      // 2. Also update matching Shipment records
      if (receipt) {
        await Shipment.updateMany(
          { receipt: receipt.trim() },
          {
            $set: {
              phone: cleanPhone,
              partyPhone: cleanPhone,
            },
          }
        );
      }

      // 3. Save into MarkaAddress directory for FUTURE REFERENCE
      const effectiveMarka = (marka || '').trim().toUpperCase();
      if (effectiveMarka) {
        await MarkaAddress.findOneAndUpdate(
          { marka: new RegExp(`^${effectiveMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          {
            $set: {
              phone: cleanPhone,
              purchaserName: party || effectiveMarka,
            },
            $setOnInsert: {
              marka: effectiveMarka,
              registrationType: 'Unregistered',
              state: 'Delhi',
            },
          },
          { upsert: true, new: true }
        );

        // Also update all other warehouse receipts with the same Mark that don't have a phone
        await WarehouseReceipt.updateMany(
          {
            $or: [{ mainMarka: effectiveMarka }, { subMarka: effectiveMarka }],
            $or: [{ phone: '' }, { phone: { $exists: false } }],
          },
          {
            $set: {
              phone: cleanPhone,
              partyPhone: cleanPhone,
            },
          }
        );
      }

      return NextResponse.json({
        success: true,
        phone: cleanPhone,
        message: `Mobile number ${cleanPhone} saved for Mark '${effectiveMarka || receipt}' for future reference!`,
      });
    }

    return NextResponse.json({ error: 'Invalid action provided' }, { status: 400 });
  } catch (error: any) {
    console.error('Error handling notification action:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process notification action' },
      { status: 500 }
    );
  }
}
