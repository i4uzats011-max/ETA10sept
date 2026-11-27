import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'xlsx';

    // Standard columns for Loading Plan Upload matching exact user logistics format
    const headers = [
      'stockstatus',
      'warehouse',
      'date',
      'Warehouse entry',
      'Receipt',
      'quantity',
      'weight',
      'volumem³',
      'commodity',
      'packaging',
      'mark',
      'plate',
      'phone',
      'delivery',
      'type',
      'Container No. ',
      'Container No. (Actual)',
    ];

    // Helpful sample rows showing how to paste data
    const sampleRows = [
      {
        'stockstatus': '库存中',
        'warehouse': '九边仓库',
        'date': '2026-11-20',
        'Warehouse entry': 'RS-21',
        'Receipt': '261120002',
        'quantity': 28,
        'weight': 631.1,
        'volumem³': 2.87,
        'commodity': '汽车LED灯',
        'packaging': 'QR1119',
        'mark': 'CS',
        'plate': '粤EDZ0505',
        'phone': '13587551339',
        'delivery': 'HUBERT',
        'type': 'custom',
        'Container No. ': 'USSI-358',
        'Container No. (Actual)': 'GESU6221024',
      },
      {
        'stockstatus': '库存中',
        'warehouse': '总部',
        'date': '2026-11-03',
        'Warehouse entry': 'RS-21',
        'Receipt': 'RFN27NOV26',
        'quantity': 9,
        'weight': 3600,
        'volumem³': 43.429,
        'commodity': '模具平台',
        'packaging': '',
        'mark': 'TED',
        'plate': '',
        'phone': '',
        'delivery': '',
        'type': 'normal',
        'Container No. ': 'USSI-358',
        'Container No. (Actual)': 'GESU6221024',
      },
      {
        'stockstatus': '库存中',
        'warehouse': 'YW',
        'date': '2026-11-23',
        'Warehouse entry': 'AS-14',
        'Receipt': '261123006',
        'quantity': 21,
        'weight': 220,
        'volumem³': 0.92,
        'commodity': '汽车启动电源',
        'packaging': 'QR1121',
        'mark': 'VIP-1',
        'plate': '粤ACB6988',
        'phone': '13928450908',
        'delivery': '货拉拉',
        'type': 'battery',
        'Container No. ': 'USSI-358',
        'Container No. (Actual)': 'GESU6221024',
      },
    ];

    if (format === 'csv') {
      // Build CSV format
      const csvHeaderLine = headers.join(',');
      const csvBody = sampleRows
        .map((row) =>
          headers
            .map((h) => {
              const val = String((row as any)[h] ?? '');
              return val.includes(',') || val.includes('"') || val.includes('\n')
                ? `"${val.replace(/"/g, '""')}"`
                : val;
            })
            .join(',')
        )
        .join('\n');

      const csvContent = `${csvHeaderLine}\n${csvBody}\n`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Loading_Plan_Upload_Template.csv"',
        },
      });
    }

    // Default: XLSX format with formatted sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });

    // Set column widths
    ws['!cols'] = [
      { wch: 14 }, // stockstatus
      { wch: 16 }, // warehouse
      { wch: 14 }, // date
      { wch: 18 }, // Warehouse entry
      { wch: 18 }, // Receipt
      { wch: 12 }, // quantity
      { wch: 12 }, // weight
      { wch: 12 }, // volumem³
      { wch: 22 }, // commodity
      { wch: 14 }, // packaging
      { wch: 14 }, // mark
      { wch: 14 }, // plate
      { wch: 16 }, // phone
      { wch: 20 }, // delivery
      { wch: 12 }, // type
      { wch: 18 }, // Container No. (Internal)
      { wch: 24 }, // Container No. (Actual)
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Loading_Plan_Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Loading_Plan_Upload_Template.xlsx"',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to generate template' }, { status: 500 });
  }
}
