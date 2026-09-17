import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import MarkaAddress from '@/models/MarkaAddress';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const marka = searchParams.get('marka')?.trim();

    if (marka) {
      const record = await MarkaAddress.findOne({
        marka: new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      return NextResponse.json({ success: true, markaAddress: record || null });
    }

    const all = await MarkaAddress.find().sort({ marka: 1 }).lean();
    return NextResponse.json({ success: true, markas: all });
  } catch (error: any) {
    console.error('Error fetching marka addresses:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch marka addresses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { marka, purchaserName, registrationType, gstin, pan, state, stateCode, address } = body;

    const cleanMarka = String(marka || '').trim();
    if (!cleanMarka) {
      return NextResponse.json({ error: 'Marka is required' }, { status: 400 });
    }

    let record = await MarkaAddress.findOne({
      marka: new RegExp(`^${cleanMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!record) {
      record = new MarkaAddress({
        marka: cleanMarka,
        purchaserName: (purchaserName || cleanMarka).trim(),
        registrationType: registrationType === 'Unregistered' ? 'Unregistered' : 'Registered',
        gstin: (gstin || '').trim().toUpperCase(),
        pan: (pan || '').trim().toUpperCase(),
        state: (state || 'Delhi').trim(),
        stateCode: (stateCode || '07').trim(),
        addresses: [],
      });
    } else {
      if (purchaserName) record.purchaserName = purchaserName.trim();
      if (registrationType) record.registrationType = registrationType;
      if (gstin !== undefined) record.gstin = (gstin || '').trim().toUpperCase();
      if (pan !== undefined) record.pan = (pan || '').trim().toUpperCase();
      if (state) record.state = state.trim();
      if (stateCode) record.stateCode = stateCode.trim();
    }

    // If adding a new address to this marka
    if (address && address.address) {
      const isDefault = Boolean(address.isDefault || record.addresses.length === 0);
      if (isDefault) {
        record.addresses.forEach((a: any) => (a.isDefault = false));
      }

      record.addresses.push({
        title: (address.title || `Address ${record.addresses.length + 1}`).trim(),
        address: address.address.trim(),
        city: (address.city || '').trim(),
        state: (address.state || record.state || 'Delhi').trim(),
        pincode: (address.pincode || '').trim(),
        contactPerson: (address.contactPerson || '').trim(),
        phone: (address.phone || '').trim(),
        isDefault,
      });
    }

    await record.save();

    return NextResponse.json({
      success: true,
      message: 'Marka purchaser details and address updated successfully',
      markaAddress: record,
    });
  } catch (error: any) {
    console.error('Error saving marka address:', error);
    return NextResponse.json({ error: error?.message || 'Failed to save marka address' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { marka, addressId, title, address, city, state, pincode, contactPerson, phone, isDefault } = body;

    const cleanMarka = String(marka || '').trim();
    if (!cleanMarka || !addressId) {
      return NextResponse.json({ error: 'Marka and Address ID are required' }, { status: 400 });
    }

    const record = await MarkaAddress.findOne({
      marka: new RegExp(`^${cleanMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!record) {
      return NextResponse.json({ error: 'Marka not found' }, { status: 404 });
    }

    const targetAddr = record.addresses.id(addressId);
    if (!targetAddr) {
      return NextResponse.json({ error: 'Address not found in this Marka' }, { status: 404 });
    }

    if (title !== undefined) targetAddr.title = title.trim();
    if (address !== undefined) targetAddr.address = address.trim();
    if (city !== undefined) targetAddr.city = city.trim();
    if (state !== undefined) targetAddr.state = state.trim();
    if (pincode !== undefined) targetAddr.pincode = pincode.trim();
    if (contactPerson !== undefined) targetAddr.contactPerson = contactPerson.trim();
    if (phone !== undefined) targetAddr.phone = phone.trim();

    if (isDefault) {
      record.addresses.forEach((a: any) => {
        a.isDefault = a._id.toString() === addressId.toString();
      });
    }

    await record.save();

    return NextResponse.json({
      success: true,
      message: 'Address updated successfully',
      markaAddress: record,
    });
  } catch (error: any) {
    console.error('Error updating marka address:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update address' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const marka = searchParams.get('marka')?.trim();
    const addressId = searchParams.get('addressId')?.trim();

    if (!marka || !addressId) {
      return NextResponse.json({ error: 'Marka and addressId are required' }, { status: 400 });
    }

    const record = await MarkaAddress.findOne({
      marka: new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!record) {
      return NextResponse.json({ error: 'Marka not found' }, { status: 404 });
    }

    record.addresses.pull({ _id: addressId });
    await record.save();

    return NextResponse.json({
      success: true,
      message: 'Address deleted successfully',
      markaAddress: record,
    });
  } catch (error: any) {
    console.error('Error deleting address:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete address' }, { status: 500 });
  }
}
