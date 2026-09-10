import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Warehouse from '@/models/Warehouse';
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
    const defaultWarehouseParam = (formData.get('warehouse') as string | null)?.trim() || '';
    const confirmSplit = (formData.get('confirmSplit') as string | null) === 'true';
    const targetContainer = ((formData.get('targetContainer') as string | null) || '').trim().toUpperCase();
    const uploadType = ((formData.get('uploadType') as string | null) || 'stock').trim().toLowerCase();

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

    if (!defaultWarehouseParam || defaultWarehouseParam === 'ALL') {
      return NextResponse.json(
        { error: 'Selecting a valid China Warehouse is strictly mandatory while uploading. Please select or create a warehouse first.' },
        { status: 400 }
      );
    }

    const totalWarehouses = await Warehouse.countDocuments();
    if (totalWarehouses === 0) {
      return NextResponse.json(
        { error: 'No warehouse found in system. You cannot upload received goods or loading plans until at least one China warehouse is created. Please create a warehouse first.' },
        { status: 400 }
      );
    }

    const defaultWarehouse = translateWarehouse(defaultWarehouseParam);

    const whDoc = await Warehouse.findOne({
      name: new RegExp(`^${defaultWarehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (!whDoc) {
      return NextResponse.json(
        { error: `Warehouse '${defaultWarehouse}' does not exist in the system. Please create the warehouse first.` },
        { status: 400 }
      );
    }

    const isPlanUpload = uploadType === 'plan' || Boolean(targetContainer);

    // If uploading a loading plan, internal container selection is mandatory
    if (uploadType === 'plan' && !targetContainer && !containerHeader) {
      return NextResponse.json(
        {
          error: 'Internal Loading Plan / Container Number is mandatory to upload a loading plan. Please select or enter an internal container number.',
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------------------------
    // MODE A: CHINA WAREHOUSE INWARD STOCK UPLOAD (No Container Column and not uploading as a plan)
    // -----------------------------------------------------------------------------------
    if (!containerHeader && !isPlanUpload) {
      if (!receiptHeader && !commodityHeader && !mainMarkHeader && !quantityHeader) {
        return NextResponse.json(
          {
            error: "Missing required columns. File must contain at least 'Receipt', 'Commodity', or 'Container'. Detected headers in file: " + rawHeaders.join(', '),
            detectedHeaders: rawHeaders,
          },
          { status: 400 }
        );
      }

      // ── DUPLICATE RECEIPT VALIDATION ──
      // 1. Check for duplicates within the uploaded file
      const seenInFile = new Set<string>();
      const duplicatesInFile: string[] = [];
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rVal = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
        const whVal = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : defaultWarehouse;
        const fWh = translateWarehouse(whVal);
        if (rVal) {
          const key = `${rVal.toLowerCase()}___${fWh.toLowerCase()}`;
          if (seenInFile.has(key)) {
            duplicatesInFile.push(`Receipt #${rVal} in ${fWh} (Row ${i + 2})`);
          } else {
            seenInFile.add(key);
          }
        }
      }
      if (duplicatesInFile.length > 0) {
        return NextResponse.json(
          {
            error: `Duplicate Receipt Error in File: Found ${duplicatesInFile.length} duplicate receipt(s) within the uploaded file:\n${duplicatesInFile.slice(0, 10).join('\n')}${duplicatesInFile.length > 10 ? `\n...and ${duplicatesInFile.length - 10} more` : ''}\n\nEvery warehouse must have strictly unique receipt numbers. Please fix the duplicate receipts in your file and re-upload.`,
            isDuplicate: true,
            duplicates: duplicatesInFile,
          },
          { status: 400 }
        );
      }

      // 2. Check for collisions against existing records in Database for the same warehouse
      const pairsToCheck: { receipt: RegExp; warehouse: RegExp }[] = [];
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rVal = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
        const whVal = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : defaultWarehouse;
        const fWh = translateWarehouse(whVal);
        if (rVal) {
          pairsToCheck.push({
            receipt: new RegExp(`^${rVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            warehouse: new RegExp(`^${fWh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          });
        }
      }

      if (pairsToCheck.length > 0) {
        const existingInDb = await WarehouseReceipt.find({ $or: pairsToCheck }).select('receipt warehouse').lean();
        if (existingInDb.length > 0) {
          const duplicateList = existingInDb.map((d: any) => `Receipt #${d.receipt} in ${d.warehouse}`);
          return NextResponse.json(
            {
              error: `Duplicate Receipt Error: ${existingInDb.length} receipt(s) in this file already exist in China warehouse stock:\n${duplicateList.slice(0, 10).join('\n')}${duplicateList.length > 10 ? `\n...and ${duplicateList.length - 10} more` : ''}\n\nEvery warehouse must have strictly unique receipt numbers. Duplicate entries are rejected.`,
              isDuplicate: true,
              duplicates: duplicateList,
            },
            { status: 400 }
          );
        }
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

        // Auto-register warehouse in Warehouse model if newly discovered
        Warehouse.findOneAndUpdate(
          { name: finalWarehouse },
          { $setOnInsert: { name: finalWarehouse, createdAt: new Date() } },
          { upsert: true }
        ).catch(() => {});

        whBulkOps.push({
          insertOne: {
            document: receiptDoc,
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

    // Ensure targetContainer exists in Container collection if specified
    if (targetContainer) {
      await Container.findOneAndUpdate(
        { container: targetContainer },
        {
          $setOnInsert: {
            container: targetContainer,
            planNumber: targetContainer,
            containerNumber: '',
            shippingLine: 'MSC',
            warehouse: defaultWarehouse,
            planStatus: 'Planning',
            isFinalized: false,
            shippedFrom: `${defaultWarehouse}, China`,
            shippedTo: 'Nhava Sheva / Mundra, India',
            currentLocation: `Planned at ${defaultWarehouse}`,
            status: 'Planning',
            eta: 'Pending',
            destinationDate: 'N/A',
            totalQuantity: 0,
            shipmentCount: 0,
          },
        },
        { upsert: true }
      );
    }

    // 1. Gather all requested receipts & sum quantities in uploaded file
    const fileQtyByReceipt = new Map<string, number>();
    const fileReceiptRows = new Map<string, number[]>();

    for (let index = 0; index < records.length; index++) {
      const row = records[index];
      let containerVal = containerHeader && row[containerHeader] !== undefined ? String(row[containerHeader]).trim().toUpperCase() : '';
      if (!containerVal && targetContainer) {
        containerVal = targetContainer;
      }
      if (!containerVal) continue;

      const rVal = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
      if (!rVal) continue;

      const cleanR = rVal.toLowerCase();
      const rawQ = quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '0';
      const q = parseInt(rawQ, 10) || 0;

      fileQtyByReceipt.set(cleanR, (fileQtyByReceipt.get(cleanR) || 0) + q);
      if (!fileReceiptRows.has(cleanR)) fileReceiptRows.set(cleanR, []);
      fileReceiptRows.get(cleanR)!.push(index + 1);
    }

    // 2. Fetch existing WarehouseReceipt stock for all receipts in the file
    const uniqueReceiptNames = Array.from(fileQtyByReceipt.keys());
    let existingWhReceipts: any[] = [];
    if (uniqueReceiptNames.length > 0) {
      existingWhReceipts = await WarehouseReceipt.find({
        $or: uniqueReceiptNames.map((r) => ({
          receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        })),
      }).lean();
    }

    const whReceiptMap = new Map<string, any>();
    existingWhReceipts.forEach((wh: any) => {
      whReceiptMap.set(wh.receipt.toLowerCase().trim(), wh);
    });

    // 3. Strict Validation: Cannot load more than received goods in warehouse
    const validationErrors: string[] = [];
    const splitWarnings: any[] = [];

    for (const [cleanR, requestedQty] of fileQtyByReceipt.entries()) {
      let wh = whReceiptMap.get(cleanR);
      const rows = fileReceiptRows.get(cleanR) || [];
      const rowList = rows.length > 3 ? `${rows.slice(0, 3).join(', ')}... (total ${rows.length} rows)` : rows.join(', ');

      if (!wh) {
        // Auto-register goods into warehouse inventory if this was an upload of a plan
        const firstRowIdx = rows[0] ? rows[0] - 1 : 0;
        const sampleRow = records[firstRowIdx] || {};
        const sampleParty = partyHeader && sampleRow[partyHeader] ? String(sampleRow[partyHeader]).trim() : 'General Party';
        const sampleCommodity = commodityHeader && sampleRow[commodityHeader] ? String(sampleRow[commodityHeader]).trim() : '';
        const sampleEnglish = englishHeader && sampleRow[englishHeader] ? String(sampleRow[englishHeader]).trim() : '';
        const { english: tEng, chinese: tCh } = translateCommodity(sampleCommodity);
        const fEng = sampleEnglish || tEng;
        const fCh = tCh || sampleCommodity;
        const fPkg = translatePackaging(packagingHeader && sampleRow[packagingHeader] ? String(sampleRow[packagingHeader]).trim() : '');
        const fWh = translateWarehouse(warehouseHeader && sampleRow[warehouseHeader] ? String(sampleRow[warehouseHeader]).trim() : defaultWarehouse);
        const fMainMark = translateMark(mainMarkHeader && sampleRow[mainMarkHeader] ? String(sampleRow[mainMarkHeader]).trim() : '');
        const fSubMark = translateMark(subMarkHeader && sampleRow[subMarkHeader] ? String(sampleRow[subMarkHeader]).trim() : '');

        const newWh = await WarehouseReceipt.create({
          receipt: receiptHeader && sampleRow[receiptHeader] ? String(sampleRow[receiptHeader]).trim() : cleanR.toUpperCase(),
          party: sampleParty,
          warehouse: fWh,
          date: dateHeader && sampleRow[dateHeader] ? formatReceiptDate(String(sampleRow[dateHeader]).trim()) : '',
          quantity: requestedQty,
          loadedQuantity: 0,
          remainingQuantity: requestedQty,
          commodity: fEng,
          english: fEng,
          chinese: fCh,
          packaging: fPkg,
          mainMarka: fMainMark,
          subMarka: fSubMark,
          status: 'Received',
          stockstatus: 'In Stock',
          uploadedAt: new Date(),
        });
        wh = newWh;
        whReceiptMap.set(cleanR, newWh);
      }

      const available = wh.remainingQuantity !== undefined ? wh.remainingQuantity : (wh.quantity - (wh.loadedQuantity || 0));

      if (requestedQty > available) {
        validationErrors.push(
          `Receipt '${wh.receipt}' (Row ${rowList}): Attempting to load ${requestedQty} units, but only ${available} units remain in warehouse (Total received: ${wh.quantity}, already loaded: ${wh.loadedQuantity || 0}).`
        );
      } else if (requestedQty < available) {
        splitWarnings.push({
          receipt: wh.receipt,
          requestedQty,
          availableQty: available,
          remainingAfter: available - requestedQty,
          warehouse: wh.warehouse || 'China Warehouse',
          party: wh.party || 'General Party',
        });
      }
    }

    // If over-allocation errors exist, immediately reject the upload
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: `Upload rejected: Quantity exceeds received warehouse stock for ${validationErrors.length} receipt(s). ` + validationErrors.slice(0, 3).join(' | ') + (validationErrors.length > 3 ? ` (+${validationErrors.length - 3} more errors)` : ''),
          validationErrors,
        },
        { status: 400 }
      );
    }

    // If user is loading less quantity than received stock (splitting cargo) and has not confirmed yet:
    if (splitWarnings.length > 0 && !confirmSplit) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: `Notice: Loading less goods than received for ${splitWarnings.length} receipt(s). This will split the cargo across containers. Please confirm to proceed.`,
        splitWarnings,
      });
    }

    const bulkOperations = [];

    for (let index = 0; index < records.length; index++) {
      const row = records[index];
      let containerVal = containerHeader && row[containerHeader] !== undefined ? String(row[containerHeader]).trim() : '';
      if (!containerVal && targetContainer) {
        containerVal = targetContainer;
      }
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

      const wh = whReceiptMap.get(receiptVal.toLowerCase());
      const totalLoadQtyForReceipt = fileQtyByReceipt.get(receiptVal.toLowerCase()) || 0;
      const isSplitItem = (wh && totalLoadQtyForReceipt < wh.quantity) || (wh && (wh.loadedQuantity || 0) > 0);
      updatePayload.isSplit = Boolean(isSplitItem);
      updatePayload.originalTotalQuantity = wh ? String(wh.quantity) : updatePayload.quantity;
      if (wh?._id) updatePayload.receiptId = wh._id;

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

    // 4. Synchronously update WarehouseReceipt loaded quantities and remaining stock balances
    for (const [cleanR, loadedQty] of fileQtyByReceipt.entries()) {
      const wh = whReceiptMap.get(cleanR);
      if (wh) {
        const newLoaded = (wh.loadedQuantity || 0) + loadedQty;
        const newRemaining = Math.max(0, wh.quantity - newLoaded);
        const newStatus = newRemaining === 0 ? 'Fully Loaded' : 'Partially Loaded';
        const newStockStatus = newRemaining === 0 ? 'Dispatched' : 'Partially Dispatched';

        await WarehouseReceipt.updateOne(
          { _id: wh._id },
          {
            $set: {
              loadedQuantity: newLoaded,
              remainingQuantity: newRemaining,
              status: newStatus,
              stockstatus: newStockStatus,
            },
          }
        );
      }
    }

    // Also ensure distinct uploaded containers exist in Container collection
    const distinctUploadContainers = Array.from(
      new Set(
        records
          .map((r) => {
            const val = containerHeader && r[containerHeader] ? String(r[containerHeader]).trim() : '';
            return val || targetContainer || '';
          })
          .filter(Boolean)
      )
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

      const totalQty = await Shipment.aggregate([
        { $match: { container: cAlias } },
        { $group: { _id: null, total: { $sum: { $toDouble: { $ifNull: ['$quantity', '0'] } } }, count: { $sum: 1 } } },
      ]);
      if (totalQty.length > 0) {
        await Container.updateOne(
          { container: cAlias },
          { $set: { totalQuantity: totalQty[0].total, shipmentCount: totalQty[0].count } }
        );
      }
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
