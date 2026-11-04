import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: Dedicated Receipt No. Wise Rate List
// Strictly READ-ONLY query - Does NOT modify any current database data
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    // 1. Fetch all containers to obtain accurate logistics dates
    const containers = await Container.find({})
      .select({
        container: 1,
        containerNumber: 1,
        shippingLine: 1,
        warehouse: 1,
        loadingDate: 1,
        startDate: 1,
        rawEta: 1,
        destinationDate: 1,
        eta: 1,
        deliveryDate: 1,
        status: 1,
      })
      .lean();

    const containerInfoMap = new Map<string, any>();
    containers.forEach((c: any) => {
      if (c.container) {
        containerInfoMap.set(c.container.trim().toUpperCase(), c);
      }
    });

    // 2. Fetch all Warehouse Receipts to get full party details and rates
    const warehouseReceipts = await WarehouseReceipt.find({})
      .select({
        receipt: 1,
        receiptNumber: 1,
        container: 1,
        party: 1,
        phone: 1,
        partyPhone: 1,
        rate: 1,
        'Overall / Receipt Freight Rate': 1,
        rateFixed: 1,
        totalCost: 1,
        cost: 1,
        quantity: 1,
        weight: 1,
        volume: 1,
        commodity: 1,
        chinese: 1,
        english: 1,
        mainMarka: 1,
        subMarka: 1,
        warehouse: 1,
        date: 1,
        loadingDate: 1,
        deliveryDate: 1,
        messageSent: 1,
        messageSentDate: 1,
        goodsItems: 1,
      })
      .lean();

    // 3. Fetch all Shipments
    const shipments = await Shipment.find({})
      .select({
        receipt: 1,
        container: 1,
        containerNumber: 1,
        shippingLine: 1,
        party: 1,
        phone: 1,
        partyPhone: 1,
        rate: 1,
        'Overall / Receipt Freight Rate': 1,
        rateFixed: 1,
        totalCost: 1,
        cost: 1,
        quantity: 1,
        weight: 1,
        volume: 1,
        commodity: 1,
        english: 1,
        mainMarka: 1,
        subMarka: 1,
        warehouse: 1,
        date: 1,
        loadingDate: 1,
        rawEta: 1,
        destinationDate: 1,
        deliveryDate: 1,
        messageSent: 1,
        messageSentDate: 1,
        goodsItems: 1,
        status: 1,
      })
      .lean();

    // Merge into unified Receipt No. Wise Rate List
    const receiptMap = new Map<string, any>();

    // Seed from Warehouse Receipts
    warehouseReceipts.forEach((wr: any) => {
      const recNo = String(wr.receipt || wr.receiptNumber || '').trim();
      if (!recNo) return;
      const key = recNo.toUpperCase();

      const rateVal = String(
        wr['Overall / Receipt Freight Rate'] || wr.rate || ''
      ).trim();

      receiptMap.set(key, {
        receipt: recNo,
        container: wr.container || '',
        containerNumber: '',
        shippingLine: '',
        party: wr.party || '',
        phone: wr.phone || wr.partyPhone || '',
        mainMarka: wr.mainMarka || '',
        subMarka: wr.subMarka || '',
        rate: rateVal,
        'Overall / Receipt Freight Rate': rateVal,
        rateFixed: Boolean(wr.rateFixed),
        totalCost: wr.totalCost || wr.cost || '',
        quantity: wr.quantity || '',
        weight: wr.weight || '',
        volume: wr.volume || '',
        commodity: wr.english || wr.commodity || wr.chinese || '',
        warehouse: wr.warehouse || '',
        date: wr.date || '',
        loadingDate: wr.loadingDate || '',
        portDate: '',
        deliveryDate: wr.deliveryDate || '',
        messageSent: Boolean(wr.messageSent),
        messageSentDate: wr.messageSentDate || '',
        goodsItems: wr.goodsItems || [],
      });
    });

    // Merge / Overlay from Shipments (which have container and shipping line data)
    shipments.forEach((s: any) => {
      const recNo = String(s.receipt || '').trim();
      if (!recNo) return;
      const key = recNo.toUpperCase();

      const existing = receiptMap.get(key) || {
        receipt: recNo,
        rate: '',
        'Overall / Receipt Freight Rate': '',
        goodsItems: [],
      };

      const shipmentRate = String(
        s['Overall / Receipt Freight Rate'] || s.rate || ''
      ).trim();
      const effectiveRate = shipmentRate || existing['Overall / Receipt Freight Rate'] || existing.rate || '';

      const cAlias = String(s.container || existing.container || '').trim().toUpperCase();
      const cInfo = containerInfoMap.get(cAlias);

      receiptMap.set(key, {
        receipt: recNo,
        container: s.container || existing.container || '',
        containerNumber: s.containerNumber || (cInfo?.containerNumber || ''),
        shippingLine: s.shippingLine || (cInfo?.shippingLine || 'MSC'),
        party: s.party || existing.party || '',
        phone: s.phone || s.partyPhone || existing.phone || '',
        mainMarka: s.mainMarka || existing.mainMarka || '',
        subMarka: s.subMarka || existing.subMarka || '',
        rate: effectiveRate,
        'Overall / Receipt Freight Rate': effectiveRate,
        rateFixed: Boolean(s.rateFixed || existing.rateFixed),
        totalCost: s.totalCost || s.cost || existing.totalCost || '',
        quantity: s.quantity || existing.quantity || '',
        weight: s.weight || existing.weight || '',
        volume: s.volume || existing.volume || '',
        commodity: s.english || s.commodity || existing.commodity || '',
        warehouse: s.warehouse || existing.warehouse || (cInfo?.warehouse || ''),
        date: s.date || existing.date || '',
        loadingDate: s.loadingDate || existing.loadingDate || (cInfo?.loadingDate || cInfo?.startDate || ''),
        portDate: s.rawEta || s.destinationDate || (cInfo?.rawEta || cInfo?.destinationDate || ''),
        deliveryDate: s.deliveryDate || existing.deliveryDate || (cInfo?.deliveryDate || ''),
        messageSent: Boolean(s.messageSent || existing.messageSent),
        messageSentDate: s.messageSentDate || existing.messageSentDate || '',
        goodsItems: s.goodsItems?.length > 0 ? s.goodsItems : existing.goodsItems,
      });
    });

    const receiptList = Array.from(receiptMap.values()).sort((a, b) =>
      a.receipt.localeCompare(b.receipt, undefined, { numeric: true, sensitivity: 'base' })
    );

    const withRateCount = receiptList.filter((r) => Boolean(r['Overall / Receipt Freight Rate'])).length;
    const withoutRateCount = receiptList.length - withRateCount;

    return NextResponse.json({
      success: true,
      totalReceipts: receiptList.length,
      withRateCount,
      withoutRateCount,
      receiptList,
    });
  } catch (error: any) {
    console.error('Error generating receipt-wise rate list:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch receipt rate list' },
      { status: 500 }
    );
  }
}
