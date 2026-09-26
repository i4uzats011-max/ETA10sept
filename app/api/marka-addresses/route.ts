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
    const {
      marka,
      purchaserName,
      registrationType,
      gstin,
      pan,
      state,
      stateCode,
      phone,
      email,
      buyerName,
      buyerAddress,
      buyerGstin,
      buyerState,
      buyerStateCode,
      address,
      consigneeAddress,
    } = body;

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
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        buyerName: (buyerName || purchaserName || cleanMarka).trim(),
        buyerAddress: (buyerAddress || '').trim(),
        buyerGstin: (buyerGstin || gstin || '').trim().toUpperCase(),
        buyerState: (buyerState || state || 'Delhi').trim(),
        buyerStateCode: (buyerStateCode || stateCode || '07').trim(),
        addresses: [],
      });
    } else {
      if (purchaserName !== undefined) record.purchaserName = purchaserName.trim();
      if (registrationType !== undefined) record.registrationType = registrationType;
      if (gstin !== undefined) record.gstin = (gstin || '').trim().toUpperCase();
      if (pan !== undefined) record.pan = (pan || '').trim().toUpperCase();
      if (state !== undefined) record.state = state.trim();
      if (stateCode !== undefined) record.stateCode = stateCode.trim();
      if (phone !== undefined) record.phone = phone.trim();
      if (email !== undefined) record.email = email.trim();
      if (buyerName !== undefined) record.buyerName = buyerName.trim();
      if (buyerAddress !== undefined) record.buyerAddress = buyerAddress.trim();
      if (buyerGstin !== undefined) record.buyerGstin = (buyerGstin || '').trim().toUpperCase();
      if (buyerState !== undefined) record.buyerState = buyerState.trim();
      if (buyerStateCode !== undefined) record.buyerStateCode = buyerStateCode.trim();
    }

    // Support multiple addresses per Marka (Sending / Dispatch Locations)
    if (Array.isArray(body.addresses)) {
      record.addresses = body.addresses;
    } else if (address && typeof address === 'object' && address.address) {
      const addrStr = String(address.address || '').trim();
      const existingIdx = record.addresses.findIndex(
        (a: any) => a.address.trim().toLowerCase() === addrStr.toLowerCase()
      );

      const isDefault = Boolean(address.isDefault || record.addresses.length === 0);
      if (isDefault) {
        record.addresses.forEach((a: any) => (a.isDefault = false));
      }

      if (existingIdx !== -1) {
        // Update existing address
        const target = record.addresses[existingIdx];
        if (address.title) target.title = address.title.trim();
        target.address = addrStr;
        if (address.city !== undefined) target.city = address.city.trim();
        if (address.state !== undefined) target.state = address.state.trim();
        if (address.pincode !== undefined) target.pincode = address.pincode.trim();
        if (address.contactPerson !== undefined) target.contactPerson = address.contactPerson.trim();
        if (address.phone !== undefined) target.phone = address.phone.trim();
        target.isDefault = isDefault;
      } else {
        // Append new location / address
        record.addresses.push({
          title: (address.title || `Location ${record.addresses.length + 1}`).trim(),
          address: addrStr,
          city: (address.city || '').trim(),
          state: (address.state || record.state || 'Delhi').trim(),
          pincode: (address.pincode || '').trim(),
          contactPerson: (address.contactPerson || '').trim(),
          phone: (address.phone || record.phone || '').trim(),
          isDefault,
        });
      }
    } else {
      const targetAddrStr = typeof consigneeAddress === 'string' ? consigneeAddress : typeof address === 'string' ? address : '';
      if (targetAddrStr.trim()) {
        const cleanTarget = targetAddrStr.trim();
        const existingIdx = record.addresses.findIndex(
          (a: any) => a.address.trim().toLowerCase() === cleanTarget.toLowerCase()
        );

        if (existingIdx !== -1) {
          if (body.title || body.addressTitle) {
            record.addresses[existingIdx].title = (body.title || body.addressTitle).trim();
          }
          if (state) record.addresses[existingIdx].state = state.trim();
          if (phone) record.addresses[existingIdx].phone = phone.trim();
        } else {
          // Add as new sending/dispatch location if it's not already in list
          const locTitle = (body.title || body.addressTitle || (record.addresses.length === 0 ? 'Primary Godown' : `Location ${record.addresses.length + 1}`)).trim();
          record.addresses.push({
            title: locTitle,
            address: cleanTarget,
            state: (state || record.state || 'Delhi').trim(),
            phone: (phone || record.phone || '').trim(),
            isDefault: record.addresses.length === 0,
          });
        }
      }
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

    if (!marka) {
      return NextResponse.json({ error: 'Marka is required' }, { status: 400 });
    }

    const record = await MarkaAddress.findOne({
      marka: new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });

    if (!record) {
      return NextResponse.json({ error: 'Marka not found' }, { status: 404 });
    }

    // If addressId is provided, remove only that address. Otherwise, delete the entire Marka record!
    if (addressId) {
      record.addresses.pull({ _id: addressId });
      await record.save();
      return NextResponse.json({
        success: true,
        message: 'Address deleted successfully',
        markaAddress: record,
      });
    } else {
      await MarkaAddress.deleteOne({ _id: record._id });
      return NextResponse.json({
        success: true,
        message: `Marka '${marka}' deleted from directory successfully`,
      });
    }
  } catch (error: any) {
    console.error('Error deleting address:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete address' }, { status: 500 });
  }
}
