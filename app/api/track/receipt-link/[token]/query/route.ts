import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrackingQuery from '@/models/TrackingQuery';
import ReceiptTracking from '@/models/ReceiptTracking';
import SalesMessage from '@/models/SalesMessage';

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
        replyAt: q.replyAt || (q.reply ? q.updatedAt : null),
        repliedBy: q.repliedBy || '',
        status: q.status || 'Pending',
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
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
    const { receiptNo, receiptNos, message, senderName, senderPhone, marka } = body;

    const formattedReceiptNo = Array.isArray(receiptNos) && receiptNos.length > 0
      ? receiptNos.join(', ')
      : String(receiptNo || '').trim();

    if (!formattedReceiptNo) {
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
      receiptNo: formattedReceiptNo,
      marka: marka ? String(marka).trim() : (trackingDoc.name || ''),
      senderName: senderName ? String(senderName).trim() : '',
      senderPhone: senderPhone ? String(senderPhone).trim() : '',
      message: message.trim(),
      status: 'Pending'
    });

    // SEND NOTIFICATION TO ALL (Sales Head, Admin, Staff, Sales Persons)
    try {
      await SalesMessage.create({
        receiptNo: formattedReceiptNo,
        container: (trackingDoc as any)?.container || '',
        senderUsername: 'customer',
        senderName: senderName ? `Customer: ${senderName}` : 'Online Customer',
        senderRole: 'staff',
        recipientUsername: 'all',
        message: `❓ New Customer Query on Receipt #${formattedReceiptNo}${marka ? ` [${marka}]` : ''}${senderPhone ? ` (Phone: ${senderPhone})` : ''}: "${message.trim()}"`,
        type: 'text',
        isRead: false,
        metadata: {
          queryId: newQuery._id.toString(),
          token,
          senderName: newQuery.senderName,
          senderPhone: newQuery.senderPhone,
          marka: newQuery.marka,
          receiptNo: formattedReceiptNo,
          queryCreatedAt: newQuery.createdAt,
        },
      });
    } catch (notifErr) {
      console.error('Non-blocking: Failed to broadcast customer query notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Your query has been sent to dispatch. We will review and reply shortly.',
      query: {
        id: newQuery._id.toString(),
        receiptNo: newQuery.receiptNo,
        senderName: newQuery.senderName,
        message: newQuery.message,
        status: newQuery.status,
        createdAt: newQuery.createdAt,
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
