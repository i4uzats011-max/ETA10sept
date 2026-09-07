import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { formatReceiptDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSuperAdminAuthenticated(req)) {
    return NextResponse.json({ error: 'Forbidden: Read-only employee accounts cannot upload data' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customSheetName = (formData.get('sheet') as string | null)?.trim();
    const mappingStr = formData.get('mapping') as string | null;
    const importMode = (formData.get('mode') as string | null) || 'append';

    let userMapping: Record<string, string> = {};
    if (mappingStr) {
      try {
        userMapping = JSON.parse(mappingStr);
      } catch {
        // ignore mapping JSON parse error
      }
    }

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    // Parse records using XLSX (supports both .xlsx, .xls, and .csv with diverse encodings)
    let records: Record<string, any>[] = [];
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      let sheetName = customSheetName || wb.SheetNames[0];
      if (!wb.Sheets[sheetName]) {
        sheetName = wb.SheetNames[0];
      }
      const sheet = wb.Sheets[sheetName];
      records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      // CSV: First try XLSX (handles BOM & encodings well), fallback to csv-parse
      try {
        const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } catch {
        const fileContent = buffer.toString('utf-8');
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'Uploaded file contains no data rows' }, { status: 400 });
    }

    const rawHeaders = Object.keys(records[0]);

    // Helper to find matching header key (case/whitespace/BOM-insensitive)
    const findHeader = (candidates: string[]): string | undefined => {
      return rawHeaders.find((h) => {
        const cleaned = h.trim().replace(/^[\uFEFF\uFFFE]/, '').toLowerCase();
        return candidates.some((c) => c.trim().toLowerCase() === cleaned);
      });
    };

    // Use user mapping if provided and present in rawHeaders, otherwise auto-detect
    const getResolvedHeader = (fieldKey: string, candidates: string[]): string | undefined => {
      if (userMapping[fieldKey] && rawHeaders.includes(userMapping[fieldKey])) {
        return userMapping[fieldKey];
      }
      return findHeader(candidates);
    };

    // 1. Container Column (Mandatory)
    const containerHeader = getResolvedHeader('container', [
      'container',
      'containernumber',
      'container_number',
      'container no',
      'container_no',
      'container alias',
      'container_alias',
      'cntr',
      'cntr no',
      'cntr_no',
      'cntrno',
      'container id',
      'container_id',
    ]);

    if (!containerHeader) {
      return NextResponse.json(
        {
          error: "Missing required 'Container' column. Detected headers in file: " + rawHeaders.join(', '),
          detectedHeaders: rawHeaders,
        },
        { status: 400 }
      );
    }

    // 2. Resolve All Other Headers
    const receiptHeader = getResolvedHeader('receipt', [
      'receipt', 'receipt no', 'receipt_no', 'receipt number', 'receipt_number',
      'bill_no', 'bill no', 'bill_number', 'bill number', 'bl no', 'bl_no', 'b/l no', 'b/l', 'rcpt', 'bill'
    ]);
    const mainMarkHeader = getResolvedHeader('mainMarka', [
      'main_marka', 'main marka', 'main_mark', 'main mark', 'mainmarka', 'mainmark',
      'marks', 'mark', 'marka', 'main_mark_name', 'shipper mark', 'shipping mark'
    ]);
    const subMarkHeader = getResolvedHeader('subMarka', [
      'sub_marka', 'sub marka', 'sub_mark', 'sub mark', 'submarka', 'submark',
      'sub marks', 'sub_marks', 'sub'
    ]);
    const dateHeader = getResolvedHeader('date', [
      'date', 'receipt date', 'receipt_date', 'date of receipt', 'rcpt date',
      'receiving date', 'entry date', 'inward date'
    ]);
    const commodityHeader = getResolvedHeader('commodity', [
      'commodity', '中文品名', '中文', 'goods', 'cargo', 'item', 'description', 'chinese', 'chineseName', 'commodity_cn'
    ]);
    const englishHeader = getResolvedHeader('english', [
      'english', 'english description', 'english name', 'description in english', 'item english'
    ]);
    const quantityHeader = getResolvedHeader('quantity', [
      'quantity', 'qty', 'ctns', 'cartons', 'pcs', 'packages', 'pkg qty', 'total qty', 'total packages', 'boxes', 'no of pkgs'
    ]);
    const weightHeader = getResolvedHeader('weight', [
      'weight', 'gross weight', 'gw', 'wt', 'weight (kg)', 'weight(kg)', 'kgs', 'gross wt', 'total weight'
    ]);
    const volumeHeader = getResolvedHeader('volume', [
      'volumem', 'volumem³', 'volumemü', 'volume', 'vol', 'cbm', 'volume (cbm)', 'volume(cbm)', 'm3', 'cbm volume'
    ]);
    const warehouseEntryHeader = getResolvedHeader('warehouseEntry', [
      'warehouse entry', 'warehouseentry', 'warehouse_entry', 'entry no', 'entry_no', 'wh entry', 'wh_entry'
    ]);
    const warehouseHeader = getResolvedHeader('warehouse', [
      'warehouse', 'wh', 'warehouse name', 'godown'
    ]);
    const stockStatusHeader = getResolvedHeader('stockstatus', [
      'stockstatus', 'stock status', 'stock_status', 'status of stock', 'stock'
    ]);
    const packagingHeader = getResolvedHeader('packaging', [
      'packaging', 'pkg', 'package type', 'packing', 'packing type'
    ]);
    const etaHeader = getResolvedHeader('eta', [
      'eta', 'eta date', 'arrival date', 'expected arrival'
    ]);
    const statusHeader = getResolvedHeader('status', [
      'status', 'container status', 'delivery status'
    ]);
    const shippingLineHeader = getResolvedHeader('shippingLine', [
      'shippingline', 'shipping line', 'shipping_line', 'carrier', 'line'
    ]);
    const actualContainerHeader = getResolvedHeader('containerNumber', [
      'containernumber', 'container_number', 'actual container', 'actual container no', 'carrier container'
    ]);

    await connectToDatabase();

    // Pre-fetch existing container mappings in DB
    const existingMappings = await Shipment.aggregate([
      {
        $group: {
          _id: '$container',
          containerNumber: { $first: '$containerNumber' },
          shippingLine: { $first: '$shippingLine' },
        },
      },
    ]);

    const mappingMap = new Map<string, { containerNumber: string; shippingLine: string }>();
    existingMappings.forEach((m) => {
      if (m._id) {
        mappingMap.set(m._id, {
          containerNumber: m.containerNumber || m._id,
          shippingLine: m.shippingLine || 'Default',
        });
      }
    });

    const bulkOperations = [];

    for (let index = 0; index < records.length; index++) {
      const row = records[index];
      const containerVal = row[containerHeader] !== undefined ? String(row[containerHeader]).trim() : '';
      if (!containerVal) continue;

      const receiptVal = receiptHeader && row[receiptHeader] !== undefined && String(row[receiptHeader]).trim()
        ? String(row[receiptHeader]).trim()
        : `REC-${Date.now()}-${index + 1}`;

      const specifiedActualContainer = actualContainerHeader && row[actualContainerHeader]
        ? String(row[actualContainerHeader]).trim()
        : null;
      const specifiedShippingLine = shippingLineHeader && row[shippingLineHeader]
        ? String(row[shippingLineHeader]).trim()
        : null;

      const existing = mappingMap.get(containerVal);
      const finalContainerNumber = specifiedActualContainer || existing?.containerNumber || containerVal;
      const finalShippingLine = specifiedShippingLine || existing?.shippingLine || 'Default';

      // Format Date: if Excel serial number like 45754, convert to readable date string
      const rawDate = dateHeader && row[dateHeader] !== undefined ? String(row[dateHeader]).trim() : '';
      const formattedDate = formatReceiptDate(rawDate);

      // Commodity & English
      const rawCommodity = commodityHeader && row[commodityHeader] !== undefined ? String(row[commodityHeader]).trim() : '';
      const rawEnglish = englishHeader && row[englishHeader] !== undefined ? String(row[englishHeader]).trim() : '';

      // ETA & Status from file if present
      const fileEta = etaHeader && row[etaHeader] !== undefined ? String(row[etaHeader]).trim() : '';
      const fileStatus = statusHeader && row[statusHeader] !== undefined ? String(row[statusHeader]).trim() : '';

      const updatePayload: Record<string, any> = {
        receipt: receiptVal,
        container: containerVal,
        containerNumber: finalContainerNumber,
        shippingLine: finalShippingLine,

        stockstatus: stockStatusHeader && row[stockStatusHeader] !== undefined ? String(row[stockStatusHeader]).trim() : '',
        warehouse: warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : '',
        date: formattedDate || rawDate,
        warehouseEntry: warehouseEntryHeader && row[warehouseEntryHeader] !== undefined ? String(row[warehouseEntryHeader]).trim() : '',
        quantity: quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '',
        weight: weightHeader && row[weightHeader] !== undefined ? String(row[weightHeader]).trim() : '',
        volume: volumeHeader && row[volumeHeader] !== undefined ? String(row[volumeHeader]).trim() : '',
        commodity: rawCommodity,
        english: rawEnglish || rawCommodity,
        packaging: packagingHeader && row[packagingHeader] !== undefined ? String(row[packagingHeader]).trim() : '',
        subMarka: subMarkHeader && row[subMarkHeader] !== undefined ? String(row[subMarkHeader]).trim() : '',
        mainMarka: mainMarkHeader && row[mainMarkHeader] !== undefined ? String(row[mainMarkHeader]).trim() : '',
      };

      if (fileEta && fileEta !== 'N/A') updatePayload.eta = fileEta;
      if (fileStatus) updatePayload.status = fileStatus;

      if (importMode === 'update') {
        const filter: Record<string, any> = {
          receipt: receiptVal,
          container: containerVal,
        };
        if (rawCommodity) filter.commodity = rawCommodity;
        if (updatePayload.warehouseEntry) filter.warehouseEntry = updatePayload.warehouseEntry;

        bulkOperations.push({
          updateOne: {
            filter,
            update: {
              $set: updatePayload,
              $setOnInsert: {
                uploadedAt: new Date(),
                eta: fileEta || 'N/A',
                status: fileStatus || 'Pending',
              },
            },
            upsert: true,
          },
        });
      } else {
        // Default 'append' mode: Adds all rows to database, natively accepting duplicate receipts across multiple containers
        bulkOperations.push({
          insertOne: {
            document: {
              ...updatePayload,
              uploadedAt: new Date(),
              eta: fileEta || 'N/A',
              status: fileStatus || 'Pending',
            },
          },
        });
      }
    }

    if (bulkOperations.length === 0) {
      return NextResponse.json({ error: 'No valid shipment rows found in file' }, { status: 400 });
    }

    const bulkResult = await Shipment.bulkWrite(bulkOperations);
    const countInserted = (bulkResult.insertedCount || 0) + (bulkResult.upsertedCount || 0);
    const countModified = bulkResult.modifiedCount || 0;

    // JSONCargo API is NOT called during upload to preserve API quota and prevent timeouts.
    // API calls are strictly reserved for:
    // 1) 7:00 AM daily scheduled cron (/api/cron/sync-eta)
    // 2) Explicit manual user sync in admin dashboard
    return NextResponse.json({
      success: true,
      message: importMode === 'update'
        ? `Manifest Processed: ${countInserted} new records inserted, ${countModified} updated. (Zero JSONCargo API calls during upload).`
        : `Manifest Processed: Successfully added ${countInserted || bulkOperations.length} cargo records to database. Duplicate receipts accepted across containers (Zero JSONCargo API calls during upload).`,
      insertedCount: countInserted || bulkOperations.length,
      updatedCount: countModified,
      totalRows: records.length,
      detectedHeaders: {
        container: containerHeader,
        receipt: receiptHeader,
        mainMark: mainMarkHeader,
        subMark: subMarkHeader,
        date: dateHeader,
        commodity: commodityHeader,
        english: englishHeader,
        quantity: quantityHeader,
        weight: weightHeader,
        volume: volumeHeader,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'File upload failed' }, { status: 500 });
  }
}
