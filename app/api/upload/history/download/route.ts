import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import UploadHistory from '@/models/UploadHistory';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import { isStaffOrAdminAuthenticated } from '@/lib/auth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// GET: Re-download uploaded Excel batch directly from database
export async function GET(req: NextRequest) {
  if (!isStaffOrAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized: Staff or Admin access required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get('id')?.trim() || searchParams.get('uploadId')?.trim();

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 });
    }

    await connectToDatabase();

    const uploadRecord = await UploadHistory.findOne({
      $or: [{ uploadId }, { _id: uploadId.match(/^[0-9a-fA-F]{24}$/) ? uploadId : null }],
    }).lean();

    if (!uploadRecord) {
      return NextResponse.json({ error: `Upload record '${uploadId}' not found.` }, { status: 404 });
    }

    const wb = XLSX.utils.book_new();

    if (uploadRecord.uploadType === 'stock') {
      // ── Warehouse Stock Upload ──
      const receipts = await WarehouseReceipt.find({
        $or: [
          { uploadBatchId: uploadRecord.uploadId },
          { receipt: { $in: uploadRecord.receipts || [] }, warehouse: uploadRecord.warehouse },
        ],
      })
        .sort({ receipt: 1 })
        .lean();

      const rows = receipts.map((r: any) => ({
        'Receipt / Bill No': r.receipt || '',
        'Date': r.date || '',
        'China Warehouse': r.warehouse || uploadRecord.warehouse || '',
        'Party / Client': r.party || '',
        'Chinese Commodity (中文品名)': r.chinese || '',
        'Item Description': r.english || r.commodity || '',
        'Packaging': r.packaging || 'Carton',
        'Quantity (Cartons)': r.quantity ?? 0,
        'Loaded Quantity': r.loadedQuantity ?? 0,
        'Remaining Stock': r.remainingQuantity ?? (r.quantity - (r.loadedQuantity || 0)),
        'Weight (KG)': r.weight || '',
        'Volume (CBM)': r.volume || '',
        'Main Marka': r.mainMarka || '',
        'Sub Marka': r.subMarka || '',
        'Rate': r.rate || '',
        'Total Cost': r.totalCost || r.cost || '',
        'Status': r.status || 'Received in Warehouse',
        'Upload Batch': uploadRecord.uploadId,
      }));

      const sheet = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.json_to_sheet([
            {
              'Notice': `Upload batch '${uploadRecord.fileName}' (${uploadRecord.uploadId}) has no active receipts (status: ${uploadRecord.status}).`,
            },
          ]);

      XLSX.utils.book_append_sheet(wb, sheet, 'Warehouse Stock');
    } else {
      // ── Container Loading Plan Upload ──
      const shipments = await Shipment.find({
        $or: [
          { container: uploadRecord.targetContainer, receipt: { $in: uploadRecord.receipts || [] } },
          { container: uploadRecord.targetContainer },
        ],
      })
        .sort({ receipt: 1 })
        .lean();

      const rows = shipments.map((s: any) => ({
        'Container Alias': s.container || uploadRecord.targetContainer || '',
        'Container Number': s.containerNumber || '',
        'Shipping Line': s.shippingLine || '',
        'Receipt / Bill No': s.receipt || '',
        'Party / Client': s.party || '',
        'Chinese Commodity (中文品名)': s.chinese || '',
        'Item Description': s.english || s.commodity || '',
        'Packaging': s.packaging || 'Carton',
        'Quantity (Cartons)': s.quantity || s.cartons || 0,
        'Weight (KG)': s.weight || '',
        'Volume (CBM)': s.volume || '',
        'Main Marka': s.mainMarka || '',
        'Sub Marka': s.subMarka || '',
        'Warehouse Origin': s.warehouse || uploadRecord.warehouse || '',
        'ETA': s.eta || '',
        'Date of Delivery': s.dateOfDelivery || '',
        'Status': s.status || 'In Transit',
        'Upload Batch': uploadRecord.uploadId,
      }));

      const sheet = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.json_to_sheet([
            {
              'Notice': `Upload batch '${uploadRecord.fileName}' (${uploadRecord.uploadId}) has no active shipments (status: ${uploadRecord.status}).`,
            },
          ]);

      XLSX.utils.book_append_sheet(wb, sheet, 'Container Plan');
    }

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const cleanBaseName = (uploadRecord.fileName || 'Upload_Data')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_');
    const downloadFileName = `${cleanBaseName}_${uploadRecord.uploadId}.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${downloadFileName}"`,
      },
    });
  } catch (error: any) {
    console.error('Download upload history error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to download upload data' },
      { status: 500 }
    );
  }
}
