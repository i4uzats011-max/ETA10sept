import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Seller from '@/models/Seller';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    let sellers = await Seller.find().sort({ isDefault: -1, createdAt: -1 }).lean();

    // If no seller entities exist in DB, create initial default company
    if (sellers.length === 0) {
      const defaultSeller = await Seller.create({
        name: 'US INTERNATIONAL LOGISTICS',
        gstin: '07AAACU1234F1Z9',
        pan: 'AAACU1234F',
        address: 'B-45, Phase-1, Mayapuri Industrial Area',
        city: 'New Delhi',
        state: 'Delhi',
        stateCode: '07',
        pincode: '110064',
        phone: '+91 9355456060',
        email: 'info@usinternationallogistics.com',
        isDefault: true,
      });
      sellers = [defaultSeller.toObject()];
    }

    return NextResponse.json({ success: true, sellers });
  } catch (error: any) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch sellers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { _id, name, gstin, pan, address, city, state, stateCode, pincode, phone, email, isDefault } = body;

    if (!name || !address) {
      return NextResponse.json({ error: 'Seller company name and address are required' }, { status: 400 });
    }

    if (isDefault) {
      await Seller.updateMany({}, { $set: { isDefault: false } });
    }

    let seller;
    if (_id) {
      seller = await Seller.findByIdAndUpdate(
        _id,
        {
          $set: {
            name: name.trim(),
            gstin: (gstin || '').trim().toUpperCase(),
            pan: (pan || '').trim().toUpperCase(),
            address: address.trim(),
            city: (city || '').trim(),
            state: (state || 'Delhi').trim(),
            stateCode: (stateCode || '07').trim(),
            pincode: (pincode || '').trim(),
            phone: (phone || '').trim(),
            email: (email || '').trim(),
            isDefault: Boolean(isDefault),
          },
        },
        { new: true }
      );
    } else {
      seller = await Seller.create({
        name: name.trim(),
        gstin: (gstin || '').trim().toUpperCase(),
        pan: (pan || '').trim().toUpperCase(),
        address: address.trim(),
        city: (city || '').trim(),
        state: (state || 'Delhi').trim(),
        stateCode: (stateCode || '07').trim(),
        pincode: (pincode || '').trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        isDefault: Boolean(isDefault),
      });
    }

    return NextResponse.json({ success: true, seller });
  } catch (error: any) {
    console.error('Error saving seller:', error);
    return NextResponse.json({ error: error?.message || 'Failed to save seller' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Seller ID is required' }, { status: 400 });
    }

    const count = await Seller.countDocuments();
    if (count <= 1) {
      return NextResponse.json({ error: 'At least one Seller party must remain in the system.' }, { status: 400 });
    }

    await Seller.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Seller deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting seller:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete seller' }, { status: 500 });
  }
}
