import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import User from '@/models/User';
import { isSalesPersonOrHeadAuthenticated, isOperationsHeadAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req) && !isOperationsHeadAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const selectedWarehouse = searchParams.get('warehouse')?.trim();

    // 1. Fetch available warehouses
    const rawWarehouses = await WarehouseReceipt.distinct('warehouse');
    const warehouses = (rawWarehouses || [])
      .filter((w: any) => typeof w === 'string' && w.trim().length > 0)
      .sort();

    // 2. Fetch distinct dates for selected warehouse (or all warehouses if none selected)
    const dateQuery: Record<string, any> = {};
    if (selectedWarehouse && selectedWarehouse !== 'ALL') {
      dateQuery.warehouse = new RegExp(`^${selectedWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }
    const rawDates = await WarehouseReceipt.distinct('date', dateQuery);
    const dates = (rawDates || [])
      .filter((d: any) => typeof d === 'string' && d.trim().length > 0)
      .sort((a: string, b: string) => b.localeCompare(a)); // Newest first

    // 3. Fetch available containers / loading plans with full logistics metadata
    const containers = await Container.find({})
      .select('container containerNumber loadingDate warehouse planStatus status totalQuantity totalVolume totalWeight destinationDate eta shippedTo shippedFrom portDate rawEta etaUpdatedAt updatedAt lastApiSync')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    // 4. Fetch distinct markas for fast search suggestions
    const rawMarkas = await WarehouseReceipt.distinct('mainMarka');
    const markas = (rawMarkas || [])
      .filter((m: any) => typeof m === 'string' && m.trim().length > 0)
      .sort();

    // 5. Fetch sales team members for dropdown
    const salesTeam = await User.find({ role: 'sales_person', isActive: true })
      .select('username name phone')
      .lean();

    return NextResponse.json({
      success: true,
      warehouses: warehouses.length > 0 ? warehouses : ['Guangzhou', 'Yiwu', 'Ningbo', 'Shenzhen', 'Foshan'],
      dates,
      markas,
      containers: containers.map((c: any) => ({
        container: c.container,
        containerNumber: c.containerNumber || '',
        loadingDate: c.loadingDate || '',
        warehouse: c.warehouse || '',
        planStatus: c.planStatus || c.status || '',
        totalQuantity: c.totalQuantity || 0,
        totalVolume: c.totalVolume || '',
        totalWeight: c.totalWeight || '',
        eta: c.destinationDate || c.eta || '',
        portName: c.shippedTo || c.shippedFrom || '',
        portDate: c.portDate || c.rawEta || '',
        lastUpdate: c.etaUpdatedAt
          ? new Date(c.etaUpdatedAt).toISOString().split('T')[0]
          : c.updatedAt
          ? new Date(c.updatedAt).toISOString().split('T')[0]
          : '',
      })),
      salesTeam: salesTeam.map((u: any) => ({
        username: u.username,
        name: u.name || u.username,
        phone: u.phone || '',
      })),
    });
  } catch (error: any) {
    console.error('Error fetching sales options:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
