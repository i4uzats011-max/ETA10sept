import { NextRequest, NextResponse } from 'next/server';
import { syncDatabaseToTypesense, isTypesenseAvailable } from '@/lib/typesense';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await syncDatabaseToTypesense();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const healthy = await isTypesenseAvailable();
    return NextResponse.json({
      success: true,
      typesenseAvailable: healthy,
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: process.env.TYPESENSE_PORT || '8108',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
