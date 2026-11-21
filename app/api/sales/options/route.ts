import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Container from '@/models/Container';
import User from '@/models/User';
import { isSalesPersonOrHeadAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isSalesPersonOrHeadAuthenticated(req)) {
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

    // 3. Fetch available containers / loading plans
    const containers = await Container.find({})
      .select('container containerNumber loadingDate warehouse planStatus totalQuantity')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // 4. Fetch sales team members for dropdown
    const salesTeam = await User.find({ role: 'sales_person', isActive: true })
      .select('username name phone')
      .lean();

    return NextResponse.json({
      success: true,
      warehouses: warehouses.length > 0 ? warehouses : ['Guangzhou', 'Yiwu', 'Ningbo', 'Shenzhen', 'Foshan'],
      dates,
      containers: containers.map((c: any) => ({
        container: c.container,
        containerNumber: c.containerNumber || '',
        loadingDate: c.loadingDate || '',
        warehouse: c.warehouse || '',
        planStatus: c.planStatus || '',
        totalQuantity: c.totalQuantity || 0,
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
