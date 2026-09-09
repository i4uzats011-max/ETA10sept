import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isSuperAdminAuthenticated } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { formatReceiptDate } from '@/lib/dateUtils';
import {
  translateCommodity,
  translateToEnglish,
  hasChineseCharacters,
  translatePackaging,
  translateWarehouse,
  translateMark,
} from '@/lib/translate';

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
    const defaultWarehouse = (formData.get('warehouse') as string | null)?.trim() || 'China Warehouse';

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

    // 1. Container Column (Optional if Inward China Receipts, Mandatory for Manifests)
    const containerHeader = getResolvedHeader('container', [
      'container', 'containernumber', 'container_number', 'container no', 'container_no',
      'container alias', 'container_alias', 'cntr', 'cntr no', 'cntr_no', 'cntrno', 'container id', 'container_id',
      '柜号', '集装箱号', '箱号', '货柜号', '内部柜号', '柜号别名', '集装箱'
    ]);

    // 2. Resolve All Other Headers (English + Chinese Logistics Headers)
    const receiptHeader = getResolvedHeader('receipt', [
      'receipt', 'receipt no', 'receipt_no', 'receipt number', 'receipt_number',
      'bill_no', 'bill no', 'bill_number', 'bill number', 'bl no', 'bl_no', 'b/l no', 'b/l', 'rcpt', 'bill',
      '单号', '收据号', '入库单号', '提单号', '票号', '运单号', '仓单号', '单据编号', '凭证号', '货单号', '收单号', '入库凭证', '入库单'
    ]);
    const partyHeader = getResolvedHeader('party', [
      'party', 'party name', 'party_name', 'partyname', 'shipper', 'customer', 'client', 'supplier', 'consignee', 'importer', 'merchant', 'party/shipper',
      '客户', '客户名称', '货主', '货主名称', '发货人', '托运人', '委托人', '供应商', '买家', '联系人', '公司名称', '客户/货主', '收货人'
    ]);
    const mainMarkHeader = getResolvedHeader('mainMarka', [
      'main_marka', 'main marka', 'main_mark', 'main mark', 'mainmarka', 'mainmark',
      'marks', 'mark', 'marka', 'main_mark_name', 'shipper mark', 'shipping mark',
      '唛头', '主唛', '大唛', '箱唛', '运输标志', '标记', '唛头/标记', '正唛'
    ]);
    const subMarkHeader = getResolvedHeader('subMarka', [
      'sub_marka', 'sub marka', 'sub_mark', 'sub mark', 'submarka', 'submark',
      'sub marks', 'sub_marks', 'sub', '副唛', '小唛', '侧唛'
    ]);
    const dateHeader = getResolvedHeader('date', [
      'date', 'receipt date', 'receipt_date', 'date of receipt', 'rcpt date',
      'receiving date', 'entry date', 'inward date',
      '日期', '收货日期', '入库日期', '进仓日期', '到货日期', '送货日期', '开单日期', '接收日期', '进库日期'
    ]);
    const commodityHeader = getResolvedHeader('commodity', [
      'commodity', '中文品名', '中文', 'goods', 'cargo', 'item', 'description', 'chinese', 'chineseName', 'commodity_cn',
      '品名', '货物名称', '商品名称', '货物', '产品名称', '品名描述', '货物描述', '物品名称', '商品', '货名'
    ]);
    const englishHeader = getResolvedHeader('english', [
      'english', 'english description', 'english name', 'description in english', 'item english',
      '英文品名', '英文描述', '英文', '英文名'
    ]);
    const quantityHeader = getResolvedHeader('quantity', [
      'quantity', 'qty', 'ctns', 'cartons', 'pcs', 'packages', 'pkg qty', 'total qty', 'total packages', 'boxes', 'no of pkgs',
      '件数', '数量', '箱数', '总件数', '总箱数', '包数', '件', '支数', '总数', '总包装数'
    ]);
    const weightHeader = getResolvedHeader('weight', [
      'weight', 'gross weight', 'gw', 'wt', 'weight (kg)', 'weight(kg)', 'kgs', 'gross wt', 'total weight',
      '重量', '毛重', '总重量', '重量(kg)', '毛重(kg)', '净重', '总毛重', '毛重（kg）'
    ]);
    const volumeHeader = getResolvedHeader('volume', [
      'volumem', 'volumem³', 'volumemü', 'volume', 'vol', 'cbm', 'volume (cbm)', 'volume(cbm)', 'm3', 'cbm volume',
      '体积', '总体积', '体积(cbm)', '方数', '立方', '总体积(cbm)', '立方数', '体积（cbm）'
    ]);
    const warehouseEntryHeader = getResolvedHeader('warehouseEntry', [
      'warehouse entry', 'warehouseentry', 'warehouse_entry', 'entry no', 'entry_no', 'wh entry', 'wh_entry',
      '入库号', '进仓号', '入仓单号', '仓库记录号', '仓储号', '进仓编号'
    ]);
    const warehouseHeader = getResolvedHeader('warehouse', [
      'warehouse', 'wh', 'warehouse name', 'godown',
      '仓库', '仓库名称', '所在仓库', '仓位', '交货仓库', '入库仓库', '收货仓库'
    ]);
    const stockStatusHeader = getResolvedHeader('stockstatus', [
      'stockstatus', 'stock status', 'stock_status', 'status of stock', 'stock',
      '库存状态', '库存', '货物状态'
    ]);
    const packagingHeader = getResolvedHeader('packaging', [
      'packaging', 'pkg', 'package type', 'packing', 'packing type',
      '包装', '包装类型', '包装方式', '包装种类', '外包装', '包装单位'
    ]);
    const etaHeader = getResolvedHeader('eta', [
      'eta', 'eta date', 'arrival date', 'expected arrival',
      '预计到港', '到港日期', '预计到达', 'eta到达'
    ]);
    const statusHeader = getResolvedHeader('status', [
      'status', 'container status', 'delivery status',
      '状态', '柜状态', '运输状态'
    ]);
    const shippingLineHeader = getResolvedHeader('shippingLine', [
      'shippingline', 'shipping line', 'shipping_line', 'carrier', 'line',
      '船公司', '船名', '船运公司', '承运人'
    ]);
    const actualContainerHeader = getResolvedHeader('containerNumber', [
      'containernumber', 'container_number', 'actual container', 'actual container no', 'carrier container',
      '实际柜号', '大柜号', '船公司柜号', '真实柜号'
    ]);
    const destinationHeader = getResolvedHeader('shippedTo', [
      'shippedto', 'shipped to', 'destination', 'dest', 'destination port', 'port of discharge', 'pod',
      '目的港', '目的地', '目的国', '卸货港', '到达港'
    ]);

    await connectToDatabase();

    // -----------------------------------------------------------------------------------
    // MODE A: CHINA WAREHOUSE INWARD STOCK UPLOAD (No Container Column in File)
    // -----------------------------------------------------------------------------------
    if (!containerHeader) {
      if (!receiptHeader && !commodityHeader && !mainMarkHeader && !quantityHeader) {
        return NextResponse.json(
          {
            error: "Missing required columns. File must contain at least 'Receipt', 'Commodity', or 'Container'. Detected headers in file: " + rawHeaders.join(', '),
            detectedHeaders: rawHeaders,
          },
          { status: 400 }
        );
      }

      const whBulkOps = [];
      for (let index = 0; index < records.length; index++) {
        const row = records[index];
        const receiptVal = receiptHeader && row[receiptHeader] !== undefined && String(row[receiptHeader]).trim()
          ? String(row[receiptHeader]).trim()
          : `REC-${Date.now()}-${index + 1}`;

        const partyVal = partyHeader && row[partyHeader] !== undefined && String(row[partyHeader]).trim()
          ? String(row[partyHeader]).trim()
          : 'General Party';

        const rawQty = quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '0';
        const parsedQty = parseInt(rawQty, 10) || 0;
        const rawDate = dateHeader && row[dateHeader] !== undefined ? String(row[dateHeader]).trim() : '';
        const formattedDate = formatReceiptDate(rawDate);
        const rawCommodity = commodityHeader && row[commodityHeader] !== undefined ? String(row[commodityHeader]).trim() : '';
        const rawEnglish = englishHeader && row[englishHeader] !== undefined ? String(row[englishHeader]).trim() : '';

        // Chinese to English translation
        const { english: translatedEnglish, chinese: translatedChinese } = translateCommodity(rawCommodity);
        const finalEnglish = rawEnglish ? (hasChineseCharacters(rawEnglish) ? translateToEnglish(rawEnglish) : rawEnglish) : translatedEnglish;
        const finalChinese = translatedChinese || (hasChineseCharacters(rawCommodity) ? rawCommodity : '');
        const finalPackaging = translatePackaging(packagingHeader && row[packagingHeader] !== undefined ? String(row[packagingHeader]).trim() : '');
        const whVal = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : defaultWarehouse;
        const finalWarehouse = translateWarehouse(whVal);
        const finalMainMark = translateMark(mainMarkHeader && row[mainMarkHeader] !== undefined ? String(row[mainMarkHeader]).trim() : '');
        const finalSubMark = translateMark(subMarkHeader && row[subMarkHeader] !== undefined ? String(row[subMarkHeader]).trim() : '');

        const receiptDoc = {
          receipt: receiptVal,
          party: partyVal,
          warehouse: finalWarehouse,
          warehouseEntry: warehouseEntryHeader && row[warehouseEntryHeader] !== undefined ? String(row[warehouseEntryHeader]).trim() : '',
          date: formattedDate || rawDate,
          quantity: parsedQty,
          loadedQuantity: 0,
          remainingQuantity: parsedQty,
          weight: weightHeader && row[weightHeader] !== undefined ? String(row[weightHeader]).trim() : '',
          volume: volumeHeader && row[volumeHeader] !== undefined ? String(row[volumeHeader]).trim() : '',
          commodity: finalEnglish,
          chinese: finalChinese,
          english: finalEnglish,
          packaging: finalPackaging,
          subMarka: finalSubMark,
          mainMarka: finalMainMark,
          status: 'Received',
          stockstatus: 'In Stock',
          uploadedAt: new Date(),
        };

        whBulkOps.push({
          updateOne: {
            filter: { receipt: receiptVal },
            update: { $set: receiptDoc },
            upsert: true,
          },
        });
      }

      if (whBulkOps.length === 0) {
        return NextResponse.json({ error: 'No valid warehouse stock rows found in file' }, { status: 400 });
      }

      const whResult = await WarehouseReceipt.bulkWrite(whBulkOps);
      const countInserted = (whResult.upsertedCount || 0) + (whResult.insertedCount || 0) + (whResult.modifiedCount || 0);

      return NextResponse.json({
        success: true,
        type: 'warehouse-receipts',
        message: `China Warehouse Inward Processed: Successfully recorded ${countInserted || whBulkOps.length} received cargo records in '${defaultWarehouse}'. Loaders can now create loading plans and split quantities across containers.`,
        insertedCount: countInserted || whBulkOps.length,
        totalRows: records.length,
        detectedHeaders: {
          receipt: receiptHeader,
          party: partyHeader,
          warehouse: warehouseHeader,
          commodity: commodityHeader,
          quantity: quantityHeader,
          weight: weightHeader,
          volume: volumeHeader,
          date: dateHeader,
        },
      });
    }

    // -----------------------------------------------------------------------------------
    // MODE B: CONTAINER MANIFEST UPLOAD (Container Column is Present)
    // -----------------------------------------------------------------------------------

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

      const partyVal = partyHeader && row[partyHeader] !== undefined && String(row[partyHeader]).trim()
        ? String(row[partyHeader]).trim()
        : 'General Party';

      // Commodity & English with automatic Chinese-to-English translation
      const rawCommodity = commodityHeader && row[commodityHeader] !== undefined ? String(row[commodityHeader]).trim() : '';
      const rawEnglish = englishHeader && row[englishHeader] !== undefined ? String(row[englishHeader]).trim() : '';
      const { english: translatedEnglish, chinese: translatedChinese } = translateCommodity(rawCommodity);
      const finalEnglish = rawEnglish ? (hasChineseCharacters(rawEnglish) ? translateToEnglish(rawEnglish) : rawEnglish) : translatedEnglish;
      const finalChinese = translatedChinese || (hasChineseCharacters(rawCommodity) ? rawCommodity : '');
      const finalPackaging = translatePackaging(packagingHeader && row[packagingHeader] !== undefined ? String(row[packagingHeader]).trim() : '');
      const finalWarehouse = translateWarehouse(warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : defaultWarehouse);
      const finalMainMark = translateMark(mainMarkHeader && row[mainMarkHeader] !== undefined ? String(row[mainMarkHeader]).trim() : '');
      const finalSubMark = translateMark(subMarkHeader && row[subMarkHeader] !== undefined ? String(row[subMarkHeader]).trim() : '');
      const destVal = destinationHeader && row[destinationHeader] ? String(row[destinationHeader]).trim() : 'Nhava Sheva / Mundra, India';

      // ETA & Status from file if present
      const fileEta = etaHeader && row[etaHeader] !== undefined ? String(row[etaHeader]).trim() : '';
      const fileStatus = statusHeader && row[statusHeader] !== undefined ? String(row[statusHeader]).trim() : '';

      const updatePayload: Record<string, any> = {
        receipt: receiptVal,
        party: partyVal,
        container: containerVal,
        containerNumber: finalContainerNumber,
        shippingLine: finalShippingLine,

        stockstatus: stockStatusHeader && row[stockStatusHeader] !== undefined ? String(row[stockStatusHeader]).trim() : '',
        warehouse: finalWarehouse,
        date: formattedDate || rawDate,
        warehouseEntry: warehouseEntryHeader && row[warehouseEntryHeader] !== undefined ? String(row[warehouseEntryHeader]).trim() : '',
        quantity: quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '',
        weight: weightHeader && row[weightHeader] !== undefined ? String(row[weightHeader]).trim() : '',
        volume: volumeHeader && row[volumeHeader] !== undefined ? String(row[volumeHeader]).trim() : '',
        commodity: finalEnglish,
        chinese: finalChinese,
        english: finalEnglish,
        packaging: finalPackaging,
        subMarka: finalSubMark,
        mainMarka: finalMainMark,
        shippedTo: destVal,
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

    // Also ensure distinct uploaded containers exist in Container collection
    const distinctUploadContainers = Array.from(
      new Set(records.map((r) => (r[containerHeader] ? String(r[containerHeader]).trim() : '')).filter(Boolean))
    );
    for (const cAlias of distinctUploadContainers) {
      await Container.findOneAndUpdate(
        { container: cAlias },
        {
          $setOnInsert: {
            container: cAlias,
            planNumber: cAlias,
            containerNumber: mappingMap.get(cAlias)?.containerNumber || '',
            shippingLine: mappingMap.get(cAlias)?.shippingLine || 'MSC',
            warehouse: defaultWarehouse,
            planStatus: 'Planning',
            isFinalized: false,
            shippedFrom: `${defaultWarehouse}, China`,
            shippedTo: 'Nhava Sheva / Mundra, India',
            status: 'Planning',
            eta: 'Pending',
          },
        },
        { upsert: true }
      );
    }

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
        party: partyHeader,
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
