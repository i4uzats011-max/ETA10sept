import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // External API tracking has been permanently stopped for all containers.
  return NextResponse.json(
    {
      success: false,
      stopped: true,
      error: 'API tracking has been permanently stopped. All container updates are direct and manual without external API calls.',
      message: 'API tracking is permanently disabled for all containers.',
      canUpdateManually: true,
    },
    { status: 400 }
  );
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      stopped: true,
      error: 'API tracking has been permanently stopped.',
    },
    { status: 400 }
  );
}
