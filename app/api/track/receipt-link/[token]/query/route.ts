import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';
import ReceiptTracking from '@/models/ReceiptTracking';

export const dynamic = 'force-dynamic';

// GET queries submitted for this public tracking token
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    await connectToDatabase();

    const queries = await TrackingQuery.find({ token }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      queries: queries.map((q: any) => ({
        id: q._id.toString(),
        receiptNo: q.receiptNo,
        senderName: q.senderName || '',
        message: q.message,
        reply: q.reply || '',
        status: q.status || 'Pending',
        createdAt: q.createdAt,
        updatedAt: q.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching tracking queries:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch queries' },
      { status: 500 }
    );
  }
}

// POST submit a customer query for a receipt
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token?.trim();
    if (!token) {
      return NextResponse.json({ success: false, message: 'Tracking token required' }, { status: 400 });
    }

    const body = await req.json();
    const { receiptNo, message, senderName, senderPhone, marka } = body;

    if (!receiptNo || !receiptNo.trim()) {
      return NextResponse.json({ success: false, message: 'Receipt No. is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ success: false, message: 'Message text is required' }, { status: 400 });
    }

    await connectToDatabase();

    // Verify token exists
    const trackingDoc = await ReceiptTracking.findOne({ token }).lean();
    if (!trackingDoc) {
      return NextResponse.json({ success: false, message: 'Invalid tracking token' }, { status: 404 });
    }

    const newQuery = await TrackingQuery.create({
      token,
      receiptNo: receiptNo.trim(),
      marka: marka ? String(marka).trim() : (trackingDoc.name || ''),
      senderName: senderName ? String(senderName).trim() : '',
      senderPhone: senderPhone ? String(senderPhone).trim() : '',
      message: message.trim(),
      status: 'Pending'
    });

    return NextResponse.json({
      success: true,
      message: 'Your query has been sent to dispatch. We will review and reply shortly.',
      query: {
        id: newQuery._id.toString(),
        receiptNo: newQuery.receiptNo,
        senderName: newQuery.senderName,
        message: newQuery.message,
        status: newQuery.status,
        createdAt: newQuery.createdAt
      }
    });
  } catch (error: any) {
    console.error('Error submitting tracking query:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to submit query' },
      { status: 500 }
    );
  }
}
