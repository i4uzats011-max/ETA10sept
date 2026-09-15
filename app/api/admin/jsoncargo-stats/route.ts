import { NextRequest, NextResponse } from 'next/server';
import { fetchApiKeyStats } from '@/lib/jsoncargo';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await fetchApiKeyStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error?.message || 'Failed to fetch API stats',
        remainingCalls: 0,
        usedCalls: 0,
        totalCalls: 0,
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const newKey = (body.apiKey || '').trim();

    if (!newKey) {
      return NextResponse.json({ error: 'JSONCargo API key is required' }, { status: 400 });
    }

    // Verify key against JSONCargo API stats endpoint
    const stats = await fetchApiKeyStats(newKey);
    if (stats.status === 'invalid_key') {
      return NextResponse.json(
        {
          success: false,
          error: stats.error || 'The provided API key was rejected by JSONCargo.',
          stats,
        },
        { status: 400 }
      );
    }

    // Update in-memory environment variable
    process.env.JSON_CARGO_API_KEY = newKey;

    // Persist to .env.local file
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('JSON_CARGO_API_KEY=')) {
          envContent = envContent.replace(
            /JSON_CARGO_API_KEY=.*/,
            `JSON_CARGO_API_KEY=${newKey}`
          );
        } else {
          envContent += `\nJSON_CARGO_API_KEY=${newKey}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch (fsErr) {
      console.warn('Could not persist updated JSON_CARGO_API_KEY to .env.local:', fsErr);
    }

    return NextResponse.json({
      success: true,
      message: `JSONCargo API key verified and saved successfully! (${stats.remainingCalls ?? 0} requests available)`,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update API key' },
      { status: 500 }
    );
  }
}

