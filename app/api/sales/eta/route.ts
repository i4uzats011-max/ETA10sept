import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Container from '@/models/Container';
import Shipment from '@/models/Shipment';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isSalesPersonOrHeadAuthenticated, getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentUser = getAuthenticatedUser(req);
  const isSalesPersonOnly = currentUser?.role === 'sales_person';
  const myUsername = (currentUser?.username || '').toLowerCase();
  const myName = (currentUser?.name || '').toLowerCase();

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'containers'; // 'containers' | 'container_items' | 'markas' | 'marka_items'

    // =========================================================================
    // 1. IN-TRANSIT CONTAINERS LIST (Lightweight, No preloaded cargo items)
    // =========================================================================
    if (type === 'containers') {
      // Find all containers that are in transit (not delivered)
      const containerDocs = await Container.find({
        isDelivered: { $ne: true },
        $or: [
          { status: { $not: /deliver/i } },
          { status: { $exists: false } }
        ]
      })
        .select('container destinationDate eta loadingDate warehouse status totalQuantity isDelivered')
        .sort({ destinationDate: 1, createdAt: -1 })
        .lean();

      // If user is sales_person only, filter only containers where they have assigned cargo
      let allowedContainers: Set<string> | null = null;
      if (isSalesPersonOnly) {
        allowedContainers = new Set();
        // Check shipments assigned to this sales person
        const myShipments = await Shipment.find({
          $or: [
            { salesPersonUsername: myUsername },
            { salesPerson: { $regex: new RegExp(`^${myName}$`, 'i') } }
          ]
        })
          .select('container')
          .lean();

        myShipments.forEach((s: any) => {
          if (s.container) allowedContainers!.add(s.container.trim().toUpperCase());
        });

        // Also check WarehouseReceipts assigned to this sales person
        const myReceipts = await WarehouseReceipt.find({
          $or: [
            { salesPersonUsername: myUsername },
            { salesPerson: { $regex: new RegExp(`^${myName}$`, 'i') } }
          ]
        })
          .select('receipt')
          .lean();

        if (myReceipts.length > 0) {
          const rNums = myReceipts.map((r: any) => r.receipt).filter(Boolean);
          const mappedShipments = await Shipment.find({
            receipt: { $in: rNums }
          })
            .select('container')
            .lean();

          mappedShipments.forEach((s: any) => {
            if (s.container) allowedContainers!.add(s.container.trim().toUpperCase());
          });
        }
      }

      const result = containerDocs
        .filter((c: any) => {
          if (!c.container || c.container === '-' || c.container.toLowerCase().includes('pending')) {
            return false;
          }
          if (allowedContainers) {
            return allowedContainers.has(c.container.trim().toUpperCase());
          }
          return true;
        })
        .map((c: any) => ({
          container: c.container, // Public reference alias (e.g. USI-01) - Carrier number NEVER exposed!
          eta: c.destinationDate || c.eta || 'In Transit',
          loadingDate: c.loadingDate || '',
          warehouse: c.warehouse || '',
          status: c.status || 'In Transit',
          totalQuantity: c.totalQuantity || 0
        }));

      return NextResponse.json({
        success: true,
        containers: result,
        count: result.length,
        userRole: currentUser?.role || 'sales_head'
      });
    }

    // =========================================================================
    // 2. ON-DEMAND CARGO ITEMS FOR A SPECIFIC CONTAINER
    // =========================================================================
    if (type === 'container_items') {
      const containerParam = searchParams.get('container')?.trim();
      if (!containerParam) {
        return NextResponse.json({ error: 'Container parameter required' }, { status: 400 });
      }

      // Query shipments in this container
      const shipQuery: Record<string, any> = {
        container: new RegExp(`^${containerParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      };

      // Strict sales_person filtering
      if (isSalesPersonOnly) {
        shipQuery.$or = [
          { salesPersonUsername: myUsername },
          { salesPerson: { $regex: new RegExp(`^${myName}$`, 'i') } }
        ];
      }

      const shipments = await Shipment.find(shipQuery)
        .select('receipt container mainMarka subMarka party commodity english chinese quantity volume weight eta status salesPerson salesRate salesRemarks goodsItems')
        .sort({ receipt: 1 })
        .lean();

      // Also enrich with WarehouseReceipt sales rate & remarks if present
      const receiptNums = shipments.map((s: any) => s.receipt).filter(Boolean);
      const whReceipts = await WarehouseReceipt.find({
        receipt: { $in: receiptNums }
      })
        .select('receipt salesPerson salesPersonUsername salesRate salesRemarks mainMarka subMarka party')
        .lean();

      const whMap = new Map();
      whReceipts.forEach((r: any) => {
        if (r.receipt) whMap.set(r.receipt, r);
      });

      const items: any[] = [];
      shipments.forEach((s: any) => {
        const wh = whMap.get(s.receipt);
        const marka = s.mainMarka || s.subMarka || wh?.mainMarka || wh?.subMarka || s.party || '-';
        const itemName = s.english || s.commodity || s.chinese || (s.goodsItems && s.goodsItems[0]?.name) || '-';

        items.push({
          receipt: s.receipt || '-',
          marka: marka,
          party: s.party || wh?.party || marka,
          itemName: itemName,
          ctn: s.quantity || '0',
          cbm: s.volume || '0',
          weight: s.weight || '0',
          salesPerson: s.salesPerson || wh?.salesPerson || 'Unassigned',
          salesRate: s.salesRate || wh?.salesRate || '-',
          salesRemarks: s.salesRemarks || wh?.salesRemarks || ''
        });
      });

      return NextResponse.json({
        success: true,
        container: containerParam,
        items,
        count: items.length
      });
    }

    // =========================================================================
    // 3. DISTINCT MARKAS (PARTIES) LIST (Lightweight)
    // =========================================================================
    if (type === 'markas') {
      const shipQuery: Record<string, any> = {
        isDelivered: { $ne: true }
      };

      if (isSalesPersonOnly) {
        shipQuery.$or = [
          { salesPersonUsername: myUsername },
          { salesPerson: { $regex: new RegExp(`^${myName}$`, 'i') } }
        ];
      }

      // Fetch distinct mainMarka and subMarka from in-transit shipments
      const [mainMarkas, subMarkas, parties] = await Promise.all([
        Shipment.distinct('mainMarka', shipQuery),
        Shipment.distinct('subMarka', shipQuery),
        Shipment.distinct('party', shipQuery)
      ]);

      const markaSet = new Set<string>();
      [...(mainMarkas || []), ...(subMarkas || []), ...(parties || [])].forEach((m: any) => {
        if (typeof m === 'string' && m.trim().length > 1) {
          markaSet.add(m.trim().toUpperCase());
        }
      });

      const sortedMarkas = Array.from(markaSet).sort();

      return NextResponse.json({
        success: true,
        markas: sortedMarkas,
        count: sortedMarkas.length
      });
    }

    // =========================================================================
    // 4. ON-DEMAND ETA & CARGO FOR A SPECIFIC MARKA
    // =========================================================================
    if (type === 'marka_items') {
      const markaParam = searchParams.get('marka')?.trim();
      if (!markaParam) {
        return NextResponse.json({ error: 'Marka parameter required' }, { status: 400 });
      }

      const markaRegex = new RegExp(`^${markaParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const shipQuery: Record<string, any> = {
        isDelivered: { $ne: true },
        $or: [
          { mainMarka: markaRegex },
          { subMarka: markaRegex },
          { party: markaRegex }
        ]
      };

      if (isSalesPersonOnly) {
        shipQuery.$and = [
          {
            $or: [
              { salesPersonUsername: myUsername },
              { salesPerson: { $regex: new RegExp(`^${myName}$`, 'i') } }
            ]
          }
        ];
      }

      const shipments = await Shipment.find(shipQuery)
        .select('receipt container mainMarka subMarka party commodity english chinese quantity volume weight eta status destinationDate loadingDate salesPerson salesRate salesRemarks')
        .sort({ destinationDate: 1 })
        .lean();

      // Find Container ETAs for public alias
      const containerAliases = Array.from(new Set(shipments.map((s: any) => s.container).filter(Boolean)));
      const containerDocs = await Container.find({
        container: { $in: containerAliases }
      })
        .select('container destinationDate eta status loadingDate')
        .lean();

      const cMap = new Map();
      containerDocs.forEach((c: any) => {
        cMap.set(c.container, c);
      });

      const items = shipments.map((s: any) => {
        const cInfo = cMap.get(s.container);
        const effectiveEta = cInfo?.destinationDate || cInfo?.eta || s.destinationDate || s.eta || 'In Transit';

        return {
          receipt: s.receipt || '-',
          container: s.container || 'Not Loaded',
          eta: effectiveEta,
          status: cInfo?.status || s.status || 'In Transit',
          marka: s.mainMarka || s.subMarka || s.party || markaParam,
          itemName: s.english || s.commodity || s.chinese || '-',
          ctn: s.quantity || '0',
          cbm: s.volume || '0',
          weight: s.weight || '0',
          salesPerson: s.salesPerson || 'Unassigned',
          salesRate: s.salesRate || '-',
          salesRemarks: s.salesRemarks || ''
        };
      });

      return NextResponse.json({
        success: true,
        marka: markaParam,
        items,
        count: items.length
      });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in /api/sales/eta:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ETA data', details: error.message },
      { status: 500 }
    );
  }
}
