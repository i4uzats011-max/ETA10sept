import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Bill from '@/models/Bill';
import Shipment from '@/models/Shipment';
import ItemHsn from '@/models/ItemHsn';
import MarkaAddress from '@/models/MarkaAddress';
import { getStateCode, getStateName } from '@/lib/states';
import { isAnyAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search')?.trim() || '';
    const marka = searchParams.get('marka')?.trim() || '';
    const container = searchParams.get('container')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const query: any = {};

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { receipt: regex },
        { billNumber: regex },
        { party: regex },
        { hsnCode: regex },
        { vehicleNumber: regex },
        { mainMarka: regex },
        { subMarka: regex },
        { container: regex },
      ];
    }

    if (marka) {
      const markaRegex = new RegExp(`^${marka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      query.$or = [{ mainMarka: markaRegex }, { subMarka: markaRegex }];
    }

    if (container) {
      query.container = new RegExp(container.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (status === 'pending') {
      query.isDispatched = false;
    } else if (status === 'dispatched' || status === 'delivered') {
      query.isDispatched = true;
    }

    const totalCount = await Bill.countDocuments(query);
    const bills = await Bill.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      bills,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error: any) {
    console.error('Error fetching bills:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch bills' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();

    // Support both single bill object or array of bills (bulk upload)
    const items: any[] = Array.isArray(body) ? body : Array.isArray(body.bills) ? body.bills : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: 'No bill records provided' }, { status: 400 });
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawReceipt = String(item.receipt || item['Receipt No.'] || item['Receeipt No.'] || item.receiptNo || '').trim();

      if (!rawReceipt) {
        errors.push({ index: i, error: 'Receipt number is required' });
        continue;
      }

      const rawItemsList = Array.isArray(item.items) ? item.items : [];
      let parsedItems: any[] = [];
      if (rawItemsList.length > 0) {
        parsedItems = rawItemsList.map((it: any, idx: number) => {
          const desc = String(it.description || it.commodity || it['Item Name'] || it.english || 'Goods').trim();
          const h = String(it.hsnCode || it.hsn || item.hsnCode || '9997').trim();
          const q = Number(it.quantity || it.quantityPcs || it.qty || 0);
          const u = String(it.unit || it.billingUnit || 'PCS').trim().toUpperCase();
          const r = Number(it.rate || 0);
          const a = Number(it.amount || (q * r).toFixed(2));
          return {
            itemNo: idx + 1,
            description: desc,
            hsnCode: h,
            quantity: q,
            unit: u,
            rate: r,
            amount: a,
          };
        });
      }

      const hsnCode = String(item.hsnCode || item['HSN Code'] || item.hsn || (parsedItems[0]?.hsnCode) || '').trim();
      let quantityPcs = Number(item.quantityPcs || item['Quantity pcs'] || item['Quntity pcs'] || item.pcs || 0);
      let quantityKg = Number(item.quantityKg || item['Quantity kg'] || item['Weight kg'] || item.kg || 0);
      let taxableValue = Number(item.taxableValue || item['Taxable'] || item.taxable || 0);

      if (parsedItems.length > 0) {
        if (!taxableValue) {
          taxableValue = Number(parsedItems.reduce((acc, it) => acc + (it.amount || 0), 0).toFixed(2));
        }
        if (!quantityPcs) {
          quantityPcs = parsedItems
            .filter((it) => it.unit.toUpperCase().includes('PC'))
            .reduce((acc, it) => acc + (it.quantity || 0), 0);
        }
        if (!quantityKg) {
          quantityKg = parsedItems
            .filter((it) => it.unit.toUpperCase().includes('KG'))
            .reduce((acc, it) => acc + (it.quantity || 0), 0);
        }
      }

      // Attempt to look up existing shipment details by receipt
      const shipment = await Shipment.findOne({
        receipt: new RegExp(`^${rawReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      // Cartons and billing unit
      const totalCartons = Number(item.totalCartons || item.cartons || item['Cartons'] || item['Cartons (CTN)'] || (shipment as any)?.quantity || 0);
      const rawUnit = String(item.billingUnit || item['Billing Unit'] || (parsedItems[0]?.unit) || 'Pcs').trim().toLowerCase();
      const billingUnit: 'Pcs' | 'KG' | 'Cartons' = rawUnit.includes('kg') ? 'KG' : rawUnit.includes('carton') || rawUnit.includes('ctn') ? 'Cartons' : 'Pcs';

      const container = item.container || (shipment as any)?.container || '';
      const containerNumber = item.containerNumber || (shipment as any)?.containerNumber || '';
      const party = item.party || (shipment as any)?.party || 'General Party';
      const mainMarka = item.mainMarka || (shipment as any)?.mainMarka || '';
      const subMarka = item.subMarka || (shipment as any)?.subMarka || '';
      const commodity = item.commodity || (parsedItems[0]?.description) || (shipment as any)?.commodity || (shipment as any)?.english || 'Commercial Cargo';
      const warehouse = item.warehouse || (shipment as any)?.warehouse || '';
      const loadingDate = item.loadingDate || (shipment as any)?.loadingDate || '';
      const eta = item.eta || (shipment as any)?.eta || '';

      const vehicleNumber = String(item.vehicleNumber || item['Vehicle Number'] || item['गाड़ी नंबर'] || '').trim();
      const eWayBillNo = String(item.eWayBillNo || item['e-Way Bill No.'] || item['eWayBillNo'] || '').trim();
      const deliveryNote = String(item.deliveryNote || item['Delivery Note'] || '').trim();
      const modeOfPayment = String(item.modeOfPayment || item['Mode/Terms of Payment'] || '').trim();
      const referenceNo = String(item.referenceNo || item['Reference No. & Date.'] || '').trim();
      const otherReferences = String(item.otherReferences || item['Other References'] || '').trim();
      const buyerOrderNo = String(item.buyerOrderNo || item["Buyer's Order No."] || '').trim();
      const buyerOrderDate = String(item.buyerOrderDate || '').trim();
      const dispatchDocNo = String(item.dispatchDocNo || item['Dispatch Doc No.'] || '').trim();
      const deliveryNoteDate = String(item.deliveryNoteDate || item['Delivery Note Date'] || '').trim();
      const destination = String(item.destination || item['Destination'] || '').trim();
      const termsOfDelivery = String(item.termsOfDelivery || item['Terms of Delivery'] || '').trim();

      const billNumber = item.billNumber || `BILL-${rawReceipt}`;

      // Seller Resolution: check if seller provided or fallback to default
      const Seller = (await import('@/models/Seller')).default;
      let sellerName = item.sellerName || '';
      let sellerGstin = item.sellerGstin || '';
      let sellerAddress = item.sellerAddress || '';
      let sellerCity = item.sellerCity || '';
      let sellerPincode = item.sellerPincode || '';
      let sellerState = item.sellerState || '';
      let sellerStateCode = item.sellerStateCode || '';
      let sellerPhone = item.sellerPhone || '';
      let sellerEmail = item.sellerEmail || '';
      let sellerId = item.sellerId || '';

      if (!sellerName || !sellerPhone || !sellerEmail) {
        const defSeller: any = (await Seller.findOne({ isDefault: true }).lean()) || (await Seller.findOne().lean());
        if (defSeller) {
          sellerId = sellerId || defSeller._id.toString();
          sellerName = sellerName || defSeller.name;
          sellerGstin = sellerGstin || defSeller.gstin || '';
          sellerAddress = sellerAddress || defSeller.address;
          sellerCity = sellerCity || defSeller.city || '';
          sellerPincode = sellerPincode || defSeller.pincode || '';
          sellerState = sellerState || defSeller.state || 'Delhi';
          sellerStateCode = sellerStateCode || defSeller.stateCode || '07';
          sellerPhone = sellerPhone || defSeller.phone || '';
          sellerEmail = sellerEmail || defSeller.email || '';
        }
      }

      // Purchaser Resolution (Registered or Unregistered)
      // Purchaser Resolution (Registered or Unregistered)
      const effectiveMarka = mainMarka || subMarka || '';
      let existingMarkaRecord = effectiveMarka
        ? await MarkaAddress.findOne({
            marka: new RegExp(`^${effectiveMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          })
        : null;

      const purchaserName = item.purchaserName || existingMarkaRecord?.purchaserName || party || 'General Party';
      const purchaserRegistrationType = item.purchaserRegistrationType || existingMarkaRecord?.registrationType || (item.purchaserGstin ? 'Registered' : 'Unregistered');
      const purchaserGstin = (item.purchaserGstin !== undefined ? item.purchaserGstin : existingMarkaRecord?.gstin) || '';
      const purchaserAddress = item.purchaserAddress || existingMarkaRecord?.addresses?.[0]?.address || '';

      const rawPState = item.purchaserState || existingMarkaRecord?.state || 'Delhi';
      const purchaserStateCode = getStateCode(item.purchaserStateCode || existingMarkaRecord?.stateCode || rawPState) || '07';
      const purchaserState = getStateName(rawPState) || 'Delhi';

      // Consignee (Ship To) & Buyer (Bill To)
      const consigneeName = item.consigneeName || existingMarkaRecord?.purchaserName || purchaserName;
      const consigneeAddress = item.consigneeAddress || existingMarkaRecord?.addresses?.[0]?.address || purchaserAddress;
      const consigneeGstin = item.consigneeGstin || purchaserGstin;

      const rawCState = item.consigneeState || item.purchaserState || existingMarkaRecord?.state || 'Delhi';
      const consigneeStateCode = getStateCode(item.consigneeStateCode || item.purchaserStateCode || existingMarkaRecord?.stateCode || rawCState) || '07';
      const consigneeState = getStateName(rawCState) || 'Delhi';

      const buyerName = item.buyerName || existingMarkaRecord?.buyerName || consigneeName;
      const buyerAddress = item.buyerAddress || existingMarkaRecord?.buyerAddress || consigneeAddress;
      const buyerGstin = item.buyerGstin || existingMarkaRecord?.buyerGstin || consigneeGstin;

      const rawBState = item.buyerState || existingMarkaRecord?.buyerState || rawCState;
      const buyerStateCode = getStateCode(item.buyerStateCode || existingMarkaRecord?.buyerStateCode || rawBState) || consigneeStateCode;
      const buyerState = getStateName(rawBState) || consigneeState;

      // Rate calculation
      const primaryQty = billingUnit === 'KG' ? (quantityKg || 1) : billingUnit === 'Cartons' ? (totalCartons || 1) : (quantityPcs || quantityKg || 1);
      const rate = Number(item.rate) || (taxableValue && primaryQty ? Number((taxableValue / primaryQty).toFixed(2)) : 0);

      // Location-Wise Tax Determination (Delhi to Delhi -> CGST + SGST; Outside Delhi -> IGST)
      const isConsigneeDelhi =
        consigneeStateCode === '07' ||
        buyerStateCode === '07' ||
        consigneeState.toLowerCase().includes('delhi') ||
        buyerState.toLowerCase().includes('delhi');

      const totalGstRate = Number(item.igst || item.IGST || 18);
      const halfGstRate = Number((totalGstRate / 2).toFixed(2));

      let cgst = 0;
      let cgstAmount = 0;
      let sgst = 0;
      let sgstAmount = 0;
      let igst = 0;
      let igstAmount = 0;
      let taxType: 'INTRA_STATE' | 'INTER_STATE' = 'INTER_STATE';

      if (isConsigneeDelhi) {
        taxType = 'INTRA_STATE';
        cgst = halfGstRate;
        sgst = halfGstRate;
        cgstAmount = Number(((taxableValue * halfGstRate) / 100).toFixed(2));
        sgstAmount = Number(((taxableValue * halfGstRate) / 100).toFixed(2));
        igst = totalGstRate;
        igstAmount = 0;
      } else {
        taxType = 'INTER_STATE';
        igst = totalGstRate;
        igstAmount = Number(((taxableValue * totalGstRate) / 100).toFixed(2));
        cgst = 0;
        sgst = 0;
        cgstAmount = 0;
        sgstAmount = 0;
      }

      const totalAmount = Number((taxableValue + (isConsigneeDelhi ? (cgstAmount + sgstAmount) : igstAmount)).toFixed(2));

      // Statutory E-Way Bill Rule:
      // Outside Delhi (> ₹50,000): eWayBillNo is strictly required
      // Delhi Local / Intra-state (> ₹1,00,000): eWayBillNo is strictly required
      if (!isConsigneeDelhi && totalAmount > 50000 && !eWayBillNo) {
        errors.push({
          receipt: rawReceipt,
          error: `आउटसाइड दिल्ली (${consigneeState || buyerState || 'Other State'}) के लिए ₹50,000 से अधिक राशि (₹${totalAmount.toLocaleString('en-IN')}) के बिल के लिए E-Way Bill No. अनिवार्य है।`,
        });
        continue;
      }

      if (isConsigneeDelhi && totalAmount > 100000 && !eWayBillNo) {
        errors.push({
          receipt: rawReceipt,
          error: `दिल्ली के भीतर (Intra-Delhi) ₹1,00,000 से अधिक राशि (₹${totalAmount.toLocaleString('en-IN')}) के बिल के लिए E-Way Bill No. अनिवार्य है।`,
        });
        continue;
      }

      // Auto-save/sync Marka Purchaser directory if Marka is present
      if (effectiveMarka) {
        try {
          const cleanEffectiveMarka = effectiveMarka.trim();
          let mRec = await MarkaAddress.findOne({
            marka: new RegExp(`^${cleanEffectiveMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          });

          const contactPh = String(item.deliveryPhone || item.purchaserPhone || item.phone || (mRec?.phone) || '').trim();
          if (!mRec) {
            mRec = await MarkaAddress.create({
              marka: cleanEffectiveMarka,
              purchaserName,
              registrationType: purchaserRegistrationType,
              gstin: purchaserGstin,
              state: consigneeState,
              stateCode: consigneeStateCode,
              phone: contactPh,
              buyerName,
              buyerAddress,
              buyerGstin,
              buyerState,
              buyerStateCode,
              addresses: consigneeAddress
                ? [{ title: 'Primary Godown', address: consigneeAddress, state: consigneeState, phone: contactPh, isDefault: true }]
                : [],
            });
          } else {
            mRec.purchaserName = purchaserName;
            mRec.registrationType = purchaserRegistrationType;
            if (purchaserGstin) mRec.gstin = purchaserGstin;
            mRec.state = consigneeState;
            mRec.stateCode = consigneeStateCode;
            if (contactPh) mRec.phone = contactPh;
            if (buyerName) mRec.buyerName = buyerName;
            if (buyerAddress) mRec.buyerAddress = buyerAddress;
            if (buyerGstin) mRec.buyerGstin = buyerGstin;
            if (buyerState) mRec.buyerState = buyerState;
            if (buyerStateCode) mRec.buyerStateCode = buyerStateCode;

            if (consigneeAddress && consigneeAddress.trim()) {
              const cleanAddr = consigneeAddress.trim();
              const existingIdx = mRec.addresses.findIndex(
                (a: any) => a.address.trim().toLowerCase() === cleanAddr.toLowerCase()
              );
              if (existingIdx !== -1) {
                mRec.addresses[existingIdx].state = consigneeState;
                if (contactPh) mRec.addresses[existingIdx].phone = contactPh;
              } else {
                mRec.addresses.push({
                  title: mRec.addresses.length === 0 ? 'Primary Godown' : `Location ${mRec.addresses.length + 1}`,
                  address: cleanAddr,
                  state: consigneeState,
                  phone: contactPh,
                  isDefault: mRec.addresses.length === 0,
                });
              }
            }
            await mRec.save();
          }
        } catch (mErr) {
          console.warn('Auto-saving Marka address failed non-critically:', mErr);
        }
      }

      // Upsert bill: if bill for this receipt already exists, update billing details without wiping vehicleNumber if already dispatched
      const existingBill = await Bill.findOne({
        $or: [{ receipt: rawReceipt }, { billNumber }],
      });

      if (existingBill) {
        existingBill.receipt = rawReceipt;
        existingBill.billNumber = billNumber;
        existingBill.hsnCode = hsnCode || existingBill.hsnCode;
        existingBill.igst = totalGstRate;
        existingBill.cgst = cgst;
        existingBill.cgstAmount = cgstAmount;
        existingBill.sgst = sgst;
        existingBill.sgstAmount = sgstAmount;
        existingBill.taxType = taxType;
        existingBill.quantityPcs = quantityPcs || existingBill.quantityPcs;
        existingBill.quantityKg = quantityKg || existingBill.quantityKg;
        existingBill.taxableValue = taxableValue || existingBill.taxableValue;
        existingBill.igstAmount = igstAmount;
        existingBill.totalAmount = totalAmount;
        existingBill.rate = rate;

        if (container) existingBill.container = container;
        if (containerNumber) existingBill.containerNumber = containerNumber;
        if (party) existingBill.party = party;
        if (mainMarka) existingBill.mainMarka = mainMarka;
        if (subMarka) existingBill.subMarka = subMarka;
        if (commodity) existingBill.commodity = commodity;
        if (warehouse) existingBill.warehouse = warehouse;
        if (totalCartons) {
          existingBill.totalCartons = totalCartons;
          existingBill.remainingCartons = Math.max(0, totalCartons - (existingBill.dispatchedCartons || 0));
        }
        if (billingUnit) existingBill.billingUnit = billingUnit;

        // Seller
        existingBill.sellerId = sellerId;
        existingBill.sellerName = sellerName;
        existingBill.sellerGstin = sellerGstin;
        existingBill.sellerAddress = sellerAddress;
        existingBill.sellerCity = sellerCity;
        existingBill.sellerPincode = sellerPincode;
        existingBill.sellerState = sellerState;
        existingBill.sellerStateCode = sellerStateCode;
        existingBill.sellerPhone = sellerPhone;
        existingBill.sellerEmail = sellerEmail;

        // Purchaser & Consignee / Buyer
        existingBill.purchaserName = purchaserName;
        existingBill.purchaserRegistrationType = purchaserRegistrationType;
        existingBill.purchaserGstin = purchaserGstin;
        existingBill.purchaserAddress = purchaserAddress;
        existingBill.purchaserState = purchaserState;
        existingBill.purchaserStateCode = purchaserStateCode;

        existingBill.consigneeName = consigneeName;
        existingBill.consigneeAddress = consigneeAddress;
        existingBill.consigneeGstin = consigneeGstin;
        existingBill.consigneeState = consigneeState;
        existingBill.consigneeStateCode = consigneeStateCode;

        existingBill.buyerName = buyerName;
        existingBill.buyerAddress = buyerAddress;
        existingBill.buyerGstin = buyerGstin;
        existingBill.buyerState = buyerState;
        existingBill.buyerStateCode = buyerStateCode;

        if (parsedItems.length > 0) existingBill.items = parsedItems;
        if (vehicleNumber) existingBill.vehicleNumber = vehicleNumber;
        if (eWayBillNo) existingBill.eWayBillNo = eWayBillNo;
        if (deliveryNote) existingBill.deliveryNote = deliveryNote;
        if (modeOfPayment) existingBill.modeOfPayment = modeOfPayment;
        if (referenceNo) existingBill.referenceNo = referenceNo;
        if (otherReferences) existingBill.otherReferences = otherReferences;
        if (buyerOrderNo) existingBill.buyerOrderNo = buyerOrderNo;
        if (buyerOrderDate) existingBill.buyerOrderDate = buyerOrderDate;
        if (dispatchDocNo) existingBill.dispatchDocNo = dispatchDocNo;
        if (deliveryNoteDate) existingBill.deliveryNoteDate = deliveryNoteDate;
        if (destination) existingBill.destination = destination;
        if (termsOfDelivery) existingBill.termsOfDelivery = termsOfDelivery;

        await existingBill.save();
        results.push(existingBill);
      } else {
        const newBill = await Bill.create({
          billNumber,
          receipt: rawReceipt,
          hsnCode,
          igst: totalGstRate,
          cgst,
          cgstAmount,
          sgst,
          sgstAmount,
          taxType,
          quantityPcs,
          quantityKg,
          totalCartons,
          dispatchedCartons: 0,
          remainingCartons: totalCartons,
          billingUnit,
          taxableValue,
          igstAmount,
          totalAmount,
          rate,
          items: parsedItems.length > 0 ? parsedItems : undefined,
          container,
          containerNumber,
          party,
          mainMarka,
          subMarka,
          commodity,
          warehouse,
          loadingDate,
          eta,
          sellerId,
          sellerName,
          sellerGstin,
          sellerAddress,
          sellerCity,
          sellerPincode,
          sellerState,
          sellerStateCode,
          sellerPhone,
          sellerEmail,
          purchaserName,
          purchaserRegistrationType,
          purchaserGstin,
          purchaserAddress,
          purchaserState,
          purchaserStateCode,
          consigneeName,
          consigneeAddress,
          consigneeGstin,
          consigneeState,
          consigneeStateCode,
          buyerName,
          buyerAddress,
          buyerGstin,
          buyerState,
          buyerStateCode,
          vehicleNumber: vehicleNumber || '',
          isDispatched: false,
          dispatchStatus: 'Pending Dispatch',
          eWayBillNo,
          deliveryNote,
          modeOfPayment,
          referenceNo,
          otherReferences,
          buyerOrderNo,
          buyerOrderDate,
          dispatchDocNo,
          deliveryNoteDate,
          destination,
          termsOfDelivery,
        });
        results.push(newBill);

        // Auto-save item name <-> HSN mapping for future automatic recall
        try {
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            for (const pi of parsedItems) {
              if (pi.description && pi.hsnCode) {
                const cleanName = String(pi.description).trim().toUpperCase();
                const cleanHsn = String(pi.hsnCode).trim();
                if (cleanName && cleanHsn) {
                  await ItemHsn.findOneAndUpdate(
                    { itemName: cleanName },
                    {
                      $set: {
                        hsnCode: cleanHsn,
                        gstRate: igst || 18,
                        source: 'auto_learned',
                      },
                      $inc: { usageCount: 1 },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                  );
                }
              }
            }
          } else if (commodity && hsnCode) {
            const cleanName = String(commodity).trim().toUpperCase();
            const cleanHsn = String(hsnCode).trim();
            if (cleanName && cleanHsn) {
              await ItemHsn.findOneAndUpdate(
                { itemName: cleanName },
                {
                  $set: {
                    hsnCode: cleanHsn,
                    gstRate: igst || 18,
                    source: 'auto_learned',
                  },
                  $inc: { usageCount: 1 },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
            }
          }
        } catch (hsnErr) {
          console.warn('Auto-saving HSN failed non-critically:', hsnErr);
        }
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0].error || 'Failed to process bill',
          errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${results.length} bills${errors.length ? ` (${errors.length} failed)` : ''}`,
      processedCount: results.length,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      bills: results,
    });
  } catch (error: any) {
    console.error('Error creating bills:', error);
    return NextResponse.json({ error: error?.message || 'Failed to generate bills' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { id, billIds, vehicleNumber, destination, deliveryAddress, deliveryAddressTitle, deliveryPhone, isDispatched } = body;

    const idsToUpdate: string[] = [];
    if (id) idsToUpdate.push(id);
    if (Array.isArray(billIds)) idsToUpdate.push(...billIds);

    if (idsToUpdate.length === 0) {
      return NextResponse.json({ error: 'Bill ID or billIds array is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (vehicleNumber !== undefined) {
      updateData.vehicleNumber = String(vehicleNumber).trim();
    }
    if (destination !== undefined) {
      updateData.destination = String(destination).trim();
    }
    if (deliveryAddress !== undefined) {
      updateData.deliveryAddress = String(deliveryAddress).trim();
    }
    if (deliveryAddressTitle !== undefined) {
      updateData.deliveryAddressTitle = String(deliveryAddressTitle).trim();
    }
    if (deliveryPhone !== undefined) {
      updateData.deliveryPhone = String(deliveryPhone).trim();
    }
    if (isDispatched !== undefined) {
      updateData.isDispatched = Boolean(isDispatched);
      if (isDispatched && !updateData.dispatchStatus) {
        updateData.dispatchStatus = 'Dispatched';
        updateData.dispatchedAt = new Date();
      }
    }

    const res = await Bill.updateMany(
      { _id: { $in: idsToUpdate } },
      { $set: updateData }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${res.modifiedCount} bills`,
      modifiedCount: res.modifiedCount,
    });
  } catch (error: any) {
    console.error('Error updating bills:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update bills' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isAnyAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const body = await req.json();
    const { id, _id, ...updatePayload } = body;
    const billId = id || _id;

    if (!billId) {
      return NextResponse.json({ error: 'Bill ID is required for editing' }, { status: 400 });
    }

    const existingBill = await Bill.findById(billId);
    if (!existingBill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    const updateFields: any = {};
    const allowedKeys = [
      'billNumber', 'receipt', 'hsnCode', 'igst', 'quantityPcs', 'quantityKg',
      'totalCartons', 'dispatchedCartons', 'remainingCartons', 'billingUnit',
      'taxableValue', 'igstAmount', 'totalAmount', 'rate',
      'sellerId', 'sellerName', 'sellerGstin', 'sellerAddress', 'sellerCity',
      'sellerPincode', 'sellerState', 'sellerStateCode', 'sellerPhone', 'sellerEmail',
      'purchaserName', 'purchaserRegistrationType', 'purchaserGstin', 'purchaserAddress',
      'purchaserState', 'purchaserStateCode',
      'consigneeName', 'consigneeAddress', 'consigneeGstin', 'consigneeState', 'consigneeStateCode',
      'buyerName', 'buyerAddress', 'buyerGstin', 'buyerState', 'buyerStateCode',
      'vehicleNumber', 'destination', 'eWayBillNo', 'deliveryDate', 'deliveryTime',
      'deliveryAddressTitle', 'deliveryAddress', 'deliveryPhone',
      'modeOfPayment', 'referenceNo', 'otherReferences', 'buyerOrderNo', 'buyerOrderDate',
      'dispatchDocNo', 'deliveryNote', 'deliveryNoteDate', 'termsOfDelivery',
      'container', 'containerNumber', 'commodity', 'mainMarka', 'subMarka', 'party'
    ];

    allowedKeys.forEach((key) => {
      if (updatePayload[key] !== undefined) {
        updateFields[key] = updatePayload[key];
      }
    });

    if (Array.isArray(updatePayload.items)) {
      updateFields.items = updatePayload.items;

      // Auto-save item name <-> HSN mapping for future automatic recall
      try {
        for (const it of updatePayload.items) {
          if (it.description && it.hsnCode) {
            const cleanName = String(it.description).trim().toUpperCase();
            const cleanHsn = String(it.hsnCode).trim();
            if (cleanName && cleanHsn) {
              await ItemHsn.findOneAndUpdate(
                { itemName: cleanName },
                {
                  $set: {
                    hsnCode: cleanHsn,
                    gstRate: typeof updatePayload.igst === 'number' ? updatePayload.igst : 18,
                    source: 'auto_learned',
                  },
                  $inc: { usageCount: 1 },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
            }
          }
        }
      } catch (hsnErr) {
        console.warn('Auto-saving HSN in PUT failed non-critically:', hsnErr);
      }
    }

    // Location-wise tax recalculation for edited bill
    const effConsigneeState = updateFields.consigneeState || existingBill.consigneeState || 'Delhi';
    const effConsigneeCode = getStateCode(updateFields.consigneeStateCode || existingBill.consigneeStateCode || effConsigneeState) || '07';
    const effBuyerState = updateFields.buyerState || existingBill.buyerState || effConsigneeState;
    const effBuyerCode = getStateCode(updateFields.buyerStateCode || existingBill.buyerStateCode || effBuyerState) || effConsigneeCode;

    const isIntraState =
      effConsigneeCode === '07' ||
      effBuyerCode === '07' ||
      effConsigneeState.toLowerCase().includes('delhi') ||
      effBuyerState.toLowerCase().includes('delhi');

    const totalGstRate = typeof updatePayload.igst === 'number' ? updatePayload.igst : existingBill.igst || 18;
    const halfGstRate = Number((totalGstRate / 2).toFixed(2));
    const totalTaxable = typeof updateFields.taxableValue === 'number' ? updateFields.taxableValue : existingBill.taxableValue || 0;

    if (isIntraState) {
      updateFields.taxType = 'INTRA_STATE';
      updateFields.cgst = halfGstRate;
      updateFields.sgst = halfGstRate;
      updateFields.cgstAmount = Number(((totalTaxable * halfGstRate) / 100).toFixed(2));
      updateFields.sgstAmount = Number(((totalTaxable * halfGstRate) / 100).toFixed(2));
      updateFields.igst = totalGstRate;
      updateFields.igstAmount = 0;
      updateFields.totalAmount = Number((totalTaxable + updateFields.cgstAmount + updateFields.sgstAmount).toFixed(2));
    } else {
      updateFields.taxType = 'INTER_STATE';
      updateFields.igst = totalGstRate;
      updateFields.igstAmount = Number(((totalTaxable * totalGstRate) / 100).toFixed(2));
      updateFields.cgst = 0;
      updateFields.sgst = 0;
      updateFields.cgstAmount = 0;
      updateFields.sgstAmount = 0;
      updateFields.totalAmount = Number((totalTaxable + updateFields.igstAmount).toFixed(2));
    }

    // Auto-sync updated address details to Marka directory
    const effMarka = (updateFields.mainMarka || existingBill.mainMarka || updateFields.subMarka || existingBill.subMarka || '').trim();
    if (effMarka) {
      try {
        const pName = updateFields.consigneeName || updateFields.purchaserName || existingBill.consigneeName || existingBill.purchaserName || effMarka;
        const cAddr = updateFields.consigneeAddress || updateFields.purchaserAddress || existingBill.consigneeAddress || existingBill.purchaserAddress || '';
        const pPhone = updateFields.deliveryPhone || updateFields.purchaserPhone || existingBill.deliveryPhone || '';
        const pGstin = updateFields.consigneeGstin || updateFields.purchaserGstin || existingBill.consigneeGstin || '';
        const regType = updateFields.purchaserRegistrationType || (pGstin ? 'Registered' : 'Unregistered');

        let mRecord = await MarkaAddress.findOne({
          marka: new RegExp(`^${effMarka.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        });

        if (!mRecord) {
          mRecord = new MarkaAddress({
            marka: effMarka,
            purchaserName: pName,
            registrationType: regType,
            gstin: pGstin,
            state: effConsigneeState,
            stateCode: effConsigneeCode,
            phone: pPhone,
            buyerName: updateFields.buyerName || existingBill.buyerName || pName,
            buyerAddress: updateFields.buyerAddress || existingBill.buyerAddress || cAddr,
            buyerGstin: updateFields.buyerGstin || existingBill.buyerGstin || pGstin,
            buyerState: effBuyerState,
            buyerStateCode: effBuyerCode,
            addresses: cAddr ? [{ title: 'Primary Godown', address: cAddr, state: effConsigneeState, phone: pPhone, isDefault: true }] : [],
          });
          await mRecord.save();
        } else {
          mRecord.purchaserName = pName;
          mRecord.registrationType = regType;
          if (pGstin) mRecord.gstin = pGstin;
          mRecord.state = effConsigneeState;
          mRecord.stateCode = effConsigneeCode;
          if (pPhone) mRecord.phone = pPhone;
          if (updateFields.buyerName) mRecord.buyerName = updateFields.buyerName;
          if (updateFields.buyerAddress) mRecord.buyerAddress = updateFields.buyerAddress;
          if (updateFields.buyerGstin) mRecord.buyerGstin = updateFields.buyerGstin;
          if (updateFields.buyerState) mRecord.buyerState = updateFields.buyerState;
          if (updateFields.buyerStateCode) mRecord.buyerStateCode = updateFields.buyerStateCode;

          if (cAddr && cAddr.trim()) {
            const cleanTarget = cAddr.trim();
            const existingIdx = mRecord.addresses.findIndex((a: any) => a.address.trim().toLowerCase() === cleanTarget.toLowerCase());
            if (existingIdx !== -1) {
              mRecord.addresses[existingIdx].state = effConsigneeState;
              if (pPhone) mRecord.addresses[existingIdx].phone = pPhone;
            } else {
              mRecord.addresses.push({
                title: mRecord.addresses.length === 0 ? 'Primary Godown' : `Location ${mRecord.addresses.length + 1}`,
                address: cleanTarget,
                state: effConsigneeState,
                phone: pPhone,
                isDefault: mRecord.addresses.length === 0,
              });
            }
          }
          await mRecord.save();
        }
      } catch (mErr) {
        console.warn('Auto-syncing Marka address in PUT failed non-critically:', mErr);
      }
    }

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      { $set: updateFields },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Bill updated successfully',
      bill: updatedBill,
    });
  } catch (error: any) {
    console.error('Error editing bill:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update bill' },
      { status: 500 }
    );
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
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }

    await Bill.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Bill deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting bill:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete bill' }, { status: 500 });
  }
}
