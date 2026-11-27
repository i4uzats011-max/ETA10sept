import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Warehouse from '@/models/Warehouse';
import UploadHistory from '@/models/UploadHistory';
import { isSuperAdminAuthenticated, getAuthenticatedUser } from '@/lib/auth';
import { recordEditLog } from '@/lib/auditLog';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { formatReceiptDate } from '@/lib/dateUtils';
import { indexSingleWarehouseReceipt } from '@/lib/typesense';
import {
  translateCommodity,
  translateToEnglish,
  hasChineseCharacters,
  translatePackaging,
  translateWarehouse,
  translateMark,
} from '@/lib/translate';
import { batchTranslateWithGemini } from '@/lib/geminiTranslate';
import { detectCarrierWithGemini, ensureShippingLineExists } from '@/lib/carrierDetector';
import { parseMetricNumber } from '@/lib/metricUtils';
import { evaluateMetricsMismatch } from '@/lib/exceptionReport';

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
    const confirmActual = (formData.get('confirmActual') as string | null) === 'true' || confirmSplit;
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

    const uploadBatchId = `UPL-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
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
        // Handle duplicate column headers (e.g. two "Container No." columns)
        const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 0) {
          const rawHeaderCols = parse(lines[0], { trim: true })[0] || [];
          const seen = new Map<string, number>();
          const dedupedHeaders = rawHeaderCols.map((h: string) => {
            const clean = h.trim();
            const count = (seen.get(clean.toLowerCase()) || 0) + 1;
            seen.set(clean.toLowerCase(), count);
            return count === 1 ? clean : `${clean}_${count - 1}`;
          });
          const restContent = lines.slice(1).join('\n');
          records = parse(restContent, {
            columns: dedupedHeaders,
            skip_empty_lines: true,
            trim: true,
          });
        }
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

    // 1. Container Column (Internal Container / Plan Alias)
    let containerHeader = getResolvedHeader('container', [
      'container', 'containernumber', 'container_number', 'container no', 'container_no',
      'container alias', 'container_alias', 'cntr', 'cntr no', 'cntr_no', 'cntrno', 'container id', 'container_id',
      '柜号', '集装箱号', '箱号', '货柜号', '内部柜号', '柜号别名', '集装箱'
    ]);

    // 1b. Actual Carrier Container Column (Shipping Line Container Number e.g. GESU6221024)
    let actualContainerHeader = getResolvedHeader('containerNumber', [
      'containernumber', 'container_number', 'actual container', 'actual container no', 'actual container number',
      'carrier container', 'container no. (actual)', 'container no (actual)', 'container no. _1', 'container no._1',
      'container no_1', 'container_1', 'containernumber_1', 'actual_container_no', 'actual_container',
      '实际柜号', '大柜号', '船公司柜号', '真实柜号'
    ]);

    // If both resolve to the same column, or if a second container column exists:
    if (containerHeader && (!actualContainerHeader || containerHeader === actualContainerHeader)) {
      const altHeader = rawHeaders.find(
        (h) => h !== containerHeader && /container|cntr|柜号|箱号/i.test(h)
      );
      if (altHeader) {
        actualContainerHeader = altHeader;
      }
    }

    // Auto-disambiguate based on standard ISO 6346 container number format (e.g. GESU6221024)
    if (containerHeader && actualContainerHeader && containerHeader !== actualContainerHeader && records.length > 0) {
      const isIso6346 = (v: string) => /^[A-Z]{4}\d{6,7}$/i.test(String(v || '').replace(/[\s-_]/g, ''));
      const sampleInternalVal = String(records[0][containerHeader] || '').trim();
      const sampleActualVal = String(records[0][actualContainerHeader] || '').trim();

      // If the containerHeader has an ISO container code and actualContainerHeader has an internal alias (like USSI-358), swap them!
      if (isIso6346(sampleInternalVal) && !isIso6346(sampleActualVal)) {
        const temp = containerHeader;
        containerHeader = actualContainerHeader;
        actualContainerHeader = temp;
      }
    }

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
    const destinationHeader = getResolvedHeader('shippedTo', [
      'shippedto', 'shipped to', 'destination', 'dest', 'destination port', 'port of discharge', 'pod',
      '目的港', '目的地', '目的国', '卸货港', '到达港'
    ]);
    const rateHeader = getResolvedHeader('rate', [
      'rate', 'goods_rate', 'rate_of_goods', 'item_rate', 'price', 'unit_rate', 'unit rate', 'goods rate', 'rate of goods',
      '单价', '费率', '价格', '单价(元)', '单价(₹)', '运费单价'
    ]);
    const rateUnitHeader = getResolvedHeader('rateUnit', [
      'rateunit', 'rate_unit', 'rate_basis', 'basis', 'unit', 'unit_type',
      '单位', '计费单位', '价格单位'
    ]);
    const costHeader = getResolvedHeader('cost', [
      'cost', 'total_cost', 'cargo_cost', 'item_cost', 'amount', 'total_amount', 'total cost', 'cargo cost', 'item cost',
      '金额', '费用', '总价', '成本', '货款', '总费用', '总金额'
    ]);
    const remarksHeader = getResolvedHeader('remarks', [
      'remarks', 'remark', 'notes', 'note', 'labeller', 'labeller_goods', 'comments', 'comment',
      '备注', '说明', '标签', '贴标', '贴标货物'
    ]);
    const rateFixedHeader = getResolvedHeader('rateFixed', [
      'rate_fixed', 'ratefixed', 'is_fixed', 'fixed_rate', 'fixed',
      '固定单价', '固定汇率', '包干', '是否固定'
    ]);
    const plateHeader = getResolvedHeader('plate', [
      'plate', 'license plate', 'truck plate', 'vehicle', 'car plate', 'plate no', 'plate_no',
      '车牌', '车牌号', '车号'
    ]);
    const phoneHeader = getResolvedHeader('phone', [
      'phone', 'mobile', 'tel', 'contact', 'telephone', 'phone no', 'phone_no',
      '电话', '联系电话', '手机', '手机号', '电话号码'
    ]);
    const deliveryHeader = getResolvedHeader('delivery', [
      'delivery', 'delivery party', 'sender', 'driver', 'carrier', 'trucking', 'express',
      '送货', '送货人', '送货方', '送货公司', '送货司机', '交货人', '交货单位', '承运人'
    ]);
    const typeHeader = getResolvedHeader('type', [
      'type', 'cargo type', 'goods type', 'commodity type', 'item type',
      '类型', '货物类型', '产品类型', '分类'
    ]);

    // Warehouse normalization helper (maps Chinese names, entry codes like RS-21, AS-14, YW-55 to standard warehouse codes)
    const normalizeWarehouse = (rawWh?: string, entryCode?: string): string => {
      const cleanWh = (rawWh || '').trim();
      const cleanEntry = (entryCode || '').trim().toUpperCase();

      if (cleanEntry === 'RS-21' || cleanEntry.startsWith('RS')) return 'GZ';
      if (cleanEntry === 'AS-14' || cleanEntry.startsWith('AS')) return 'YW';
      if (cleanEntry === 'YW-55' || cleanEntry === 'YW55') return 'YW-55';

      const upper = cleanWh.toUpperCase();
      if (upper === 'GZ' || upper === 'GUANGZHOU' || cleanWh.includes('广州') || cleanWh.includes('九边')) return 'GZ';
      if (upper === 'YW-55' || upper === 'YW55' || cleanWh.includes('55')) return 'YW-55';
      if (upper === 'YW' || upper === 'YIWU' || cleanWh.includes('义乌')) return 'YW';
      if (cleanWh === '总部' || cleanWh.includes('总部')) {
        return cleanEntry === 'RS-21' ? 'GZ' : 'YW';
      }

      const translated = translateWarehouse(cleanWh);
      if (translated === 'GZ' || translated === 'YW' || translated === 'YW-55') return translated;
      return cleanWh || 'GZ';
    };

    await connectToDatabase();

    const isPlanUpload = uploadType === 'plan' || Boolean(targetContainer) || Boolean(containerHeader);

    // If uploading a loading plan or file has warehouse columns, user can either rely on file's warehouse or dropdown
    const hasRowWarehouse = Boolean(warehouseHeader || warehouseEntryHeader);
    if (!hasRowWarehouse && (!defaultWarehouseParam || defaultWarehouseParam === 'ALL')) {
      return NextResponse.json(
        { error: 'Warehouse is strictly mandatory: Either provide warehouse in file columns or select a China warehouse.' },
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

    let defaultWarehouse = 'GZ';
    if (defaultWarehouseParam && defaultWarehouseParam !== 'ALL') {
      defaultWarehouse = normalizeWarehouse(defaultWarehouseParam);
    }

    // If uploading a loading plan, internal container selection is mandatory
    if (uploadType === 'plan' && !targetContainer && !containerHeader) {
      return NextResponse.json(
        {
          error: 'Internal Loading Plan / Container Number is mandatory to upload a loading plan. Please select or enter an internal container number.',
        },
        { status: 400 }
      );
    }

    // Collect all Chinese terms from uploaded rows for Google Gemini AI batch translation
    const chineseTermsToTranslate: string[] = [];
    for (const r of records) {
      const comm = commodityHeader && r[commodityHeader] !== undefined ? String(r[commodityHeader]).trim() : '';
      const eng = englishHeader && r[englishHeader] !== undefined ? String(r[englishHeader]).trim() : '';
      const pkg = packagingHeader && r[packagingHeader] !== undefined ? String(r[packagingHeader]).trim() : '';
      const rem = remarksHeader && r[remarksHeader] !== undefined ? String(r[remarksHeader]).trim() : '';
      const deliv = deliveryHeader && r[deliveryHeader] !== undefined ? String(r[deliveryHeader]).trim() : '';
      const stockst = stockStatusHeader && r[stockStatusHeader] !== undefined ? String(r[stockStatusHeader]).trim() : '';
      if (hasChineseCharacters(comm)) chineseTermsToTranslate.push(comm);
      if (hasChineseCharacters(eng)) chineseTermsToTranslate.push(eng);
      if (hasChineseCharacters(pkg)) chineseTermsToTranslate.push(pkg);
      if (hasChineseCharacters(rem)) chineseTermsToTranslate.push(rem);
      if (hasChineseCharacters(deliv)) chineseTermsToTranslate.push(deliv);
      if (hasChineseCharacters(stockst)) chineseTermsToTranslate.push(stockst);
    }
    const aiTranslationMap = await batchTranslateWithGemini(chineseTermsToTranslate);

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

      // ── DUPLICATE & MANDATORY FIELD VALIDATION (PARTIAL SAVE UNIQUE RECORDS) ──
      const duplicatesList: Array<{ receipt: string; warehouse: string; row: number; reason: string }> = [];
      const missingDetails: Array<{ row: number; reason: string }> = [];

      interface ValidCandidate {
        row: Record<string, any>;
        index: number;
        receiptVal: string;
        dateVal: string;
        warehouseVal: string;
        extraRows: Array<{ row: Record<string, any>; index: number }>;
      }
      const candidateMap = new Map<string, ValidCandidate>();

      for (let index = 0; index < records.length; index++) {
        const row = records[index];
        const rawReceipt = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
        const rawDate = dateHeader && row[dateHeader] !== undefined ? String(row[dateHeader]).trim() : '';
        const formattedDate = formatReceiptDate(rawDate) || rawDate;
        const whVal = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : defaultWarehouse;
        const fWh = translateWarehouse(whVal);

        // 1. Mandatory Receipt Number Check
        if (!rawReceipt) {
          missingDetails.push({
            row: index + 2,
            reason: `Row ${index + 2}: Missing mandatory Receipt Number. Entry skipped.`,
          });
          continue;
        }

        // 2. Mandatory Receipt Date Check
        if (!formattedDate) {
          missingDetails.push({
            row: index + 2,
            reason: `Row ${index + 2} (Receipt #${rawReceipt}): Missing mandatory Receipt Date. Entry skipped.`,
          });
          continue;
        }

        // 3. Check for multiple items under the same receipt within the file
        const fileKey = `${rawReceipt.toLowerCase()}___${fWh.toLowerCase()}`;
        if (candidateMap.has(fileKey)) {
          candidateMap.get(fileKey)!.extraRows.push({ row, index });
          continue;
        }

        candidateMap.set(fileKey, {
          row,
          index,
          receiptVal: rawReceipt,
          dateVal: formattedDate,
          warehouseVal: fWh,
          extraRows: [],
        });
      }

      const candidateRows = Array.from(candidateMap.values());

      // Check candidate records against Database for duplicates in the same warehouse
      const pairsToCheck = candidateRows.map((c) => ({
        receipt: new RegExp(`^${c.receiptVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        warehouse: new RegExp(`^${c.warehouseVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }));

      const existingInDb = pairsToCheck.length > 0
        ? await WarehouseReceipt.find({ $or: pairsToCheck }).select('receipt warehouse').lean()
        : [];

      const existingDbSet = new Set<string>();
      existingInDb.forEach((d: any) => {
        existingDbSet.add(`${String(d.receipt).toLowerCase().trim()}___${String(d.warehouse).toLowerCase().trim()}`);
      });

      const whBulkOps = [];
      const savedReceipts: string[] = [];
      const savedReceiptDocs: any[] = [];

      for (const item of candidateRows) {
        const dbKey = `${item.receiptVal.toLowerCase()}___${item.warehouseVal.toLowerCase()}`;
        if (existingDbSet.has(dbKey)) {
          duplicatesList.push({
            receipt: item.receiptVal,
            warehouse: item.warehouseVal,
            row: item.index + 2,
            reason: `Already exists in ${item.warehouseVal} warehouse stock.`,
          });
          continue;
        }

        // UNIQUE & VALID RECORD -> Prepare items and save
        const allItemRows = [{ row: item.row, index: item.index }, ...item.extraRows];
        const receiptItems: any[] = [];
        let totalQty = 0;

        for (const it of allItemRows) {
          const r = it.row;
          const rQty = quantityHeader && r[quantityHeader] !== undefined ? parseInt(String(r[quantityHeader]).trim(), 10) || 0 : 0;
          totalQty += rQty;
          const rCommodity = commodityHeader && r[commodityHeader] !== undefined ? String(r[commodityHeader]).trim() : '';
          const rEnglish = englishHeader && r[englishHeader] !== undefined ? String(r[englishHeader]).trim() : '';

          let itEn = '';
          if (hasChineseCharacters(rEnglish)) {
            itEn = aiTranslationMap[rEnglish] || translateToEnglish(rEnglish);
          } else if (rEnglish && rEnglish !== 'General Merchandise') {
            itEn = rEnglish;
          } else if (hasChineseCharacters(rCommodity)) {
            itEn = aiTranslationMap[rCommodity] || translateCommodity(rCommodity).english;
          } else {
            itEn = rCommodity || 'General Goods';
          }

          const itCn = hasChineseCharacters(rCommodity) ? rCommodity : (hasChineseCharacters(rEnglish) ? rEnglish : '');

          const rawPkg = packagingHeader && r[packagingHeader] !== undefined ? String(r[packagingHeader]).trim() : '';
          const itPkg = hasChineseCharacters(rawPkg)
            ? (aiTranslationMap[rawPkg] || translatePackaging(rawPkg) || 'Carton')
            : (translatePackaging(rawPkg) || 'Carton');
          const itWt = weightHeader && r[weightHeader] !== undefined ? String(r[weightHeader]).trim() : '';
          const itVol = volumeHeader && r[volumeHeader] !== undefined ? String(r[volumeHeader]).trim() : '';
          const itRate = rateHeader && r[rateHeader] !== undefined ? String(r[rateHeader]).trim() : '';
          const itRateUnit = rateUnitHeader && r[rateUnitHeader] !== undefined ? String(r[rateUnitHeader]).trim() : 'CTN';
          const itCost = costHeader && r[costHeader] !== undefined ? String(r[costHeader]).trim() : '';
          const itRemarks = remarksHeader && r[remarksHeader] !== undefined ? String(r[remarksHeader]).trim() : '';

          receiptItems.push({
            itemName: itEn || rCommodity || 'General Goods',
            english: itEn || rCommodity || 'General Goods',
            chinese: itCn,
            quantity: rQty,
            packaging: itPkg || 'Carton',
            weight: itWt,
            volume: itVol,
            rate: itRate,
            rateUnit: itRateUnit,
            cost: itCost,
            remarks: itRemarks,
            mainMarka: translateMark(mainMarkHeader && r[mainMarkHeader] !== undefined ? String(r[mainMarkHeader]).trim() : ''),
            subMarka: translateMark(subMarkHeader && r[subMarkHeader] !== undefined ? String(r[subMarkHeader]).trim() : ''),
          });
        }

        const primaryRow = item.row;
        const partyVal = partyHeader && primaryRow[partyHeader] !== undefined && String(primaryRow[partyHeader]).trim()
          ? String(primaryRow[partyHeader]).trim()
          : 'General Party';

        const finalPackaging = translatePackaging(packagingHeader && primaryRow[packagingHeader] !== undefined ? String(primaryRow[packagingHeader]).trim() : '');
        const finalMainMark = translateMark(mainMarkHeader && primaryRow[mainMarkHeader] !== undefined ? String(primaryRow[mainMarkHeader]).trim() : '');
        const finalSubMark = translateMark(subMarkHeader && primaryRow[subMarkHeader] !== undefined ? String(primaryRow[subMarkHeader]).trim() : '');

        const compositeCommodity = receiptItems.length > 1
          ? receiptItems.map((ri) => `${ri.itemName}${ri.quantity ? ` (${ri.quantity} CTN)` : ''}`).join(', ')
          : (receiptItems[0]?.itemName || 'General Goods');
        const compositeChinese = receiptItems.map((ri) => ri.chinese).filter(Boolean).join(', ');

        const topRate = receiptItems.find((i) => i.rate)?.rate || (rateHeader && primaryRow[rateHeader] !== undefined ? String(primaryRow[rateHeader]).trim() : '');
        const topRateUnit = receiptItems.find((i) => i.rateUnit)?.rateUnit || (rateUnitHeader && primaryRow[rateUnitHeader] !== undefined ? String(primaryRow[rateUnitHeader]).trim() : 'CTN');
        const topRemarks = receiptItems.find((i) => i.remarks)?.remarks || (remarksHeader && primaryRow[remarksHeader] !== undefined ? String(primaryRow[remarksHeader]).trim() : '');
        const topCost = costHeader && primaryRow[costHeader] !== undefined ? String(primaryRow[costHeader]).trim() : (receiptItems.find((i) => i.cost)?.cost || '');
        const topRateFixed = rateFixedHeader && primaryRow[rateFixedHeader] !== undefined ? Boolean(primaryRow[rateFixedHeader]) : false;
        const isLabblerGoods = Boolean(topRemarks || (remarksHeader && /labell?er/i.test(topRemarks)));

        const goodsItemsList = receiptItems.map((it) => ({
          name: it.itemName,
          rate: it.rate,
          rateUnit: it.rateUnit || 'CTN',
          ctn: it.quantity,
          cbm: it.volume,
          weight: it.weight,
          cost: it.cost,
          remarks: it.remarks,
        }));

        const primaryVol = volumeHeader && primaryRow[volumeHeader] !== undefined ? String(primaryRow[volumeHeader]).trim() : '';
        const primaryWt = weightHeader && primaryRow[weightHeader] !== undefined ? String(primaryRow[weightHeader]).trim() : '';

        const receiptDoc = {
          receipt: item.receiptVal,
          party: partyVal,
          warehouse: item.warehouseVal,
          warehouseEntry: warehouseEntryHeader && primaryRow[warehouseEntryHeader] !== undefined ? String(primaryRow[warehouseEntryHeader]).trim() : '',
          date: item.dateVal,
          quantity: totalQty,
          loadedQuantity: 0,
          remainingQuantity: totalQty,
          weight: primaryWt,
          loadedWeight: 0,
          remainingWeight: primaryWt,
          volume: primaryVol,
          loadedVolume: 0,
          remainingVolume: primaryVol,
          balanceItem: {
            name: compositeCommodity,
            ctn: totalQty,
            cbm: parseMetricNumber(primaryVol),
            weight: parseMetricNumber(primaryWt),
          },
          commodity: compositeCommodity,
          chinese: compositeChinese,
          english: compositeCommodity,
          packaging: finalPackaging,
          subMarka: finalSubMark,
          mainMarka: finalMainMark,
          items: receiptItems,
          goodsItems: goodsItemsList,
          rate: topRate,
          rateFixed: topRateFixed,
          totalCost: topCost,
          cost: topCost,
          remarks: topRemarks,
          isLabblerGoods,
          status: 'Received in Warehouse',
          stockstatus: 'In Stock',
          uploadBatchId,
          uploadedAt: new Date(),
        };

        // Auto-register warehouse in Warehouse model if newly discovered
        Warehouse.findOneAndUpdate(
          { name: item.warehouseVal },
          { $setOnInsert: { name: item.warehouseVal, createdAt: new Date() } },
          { upsert: true }
        ).catch(() => {});

        whBulkOps.push({
          insertOne: {
            document: receiptDoc,
          },
        });
        savedReceipts.push(item.receiptVal);
        savedReceiptDocs.push(receiptDoc);
      }

      if (whBulkOps.length > 0) {
        await WarehouseReceipt.bulkWrite(whBulkOps);
        // Async index to Typesense
        savedReceiptDocs.forEach((doc) => {
          indexSingleWarehouseReceipt(doc).catch(() => {});
        });
      }

      // Record in UploadHistory
      await UploadHistory.create({
        uploadId: uploadBatchId,
        fileName: file.name,
        uploadType: 'stock',
        warehouse: defaultWarehouse,
        totalRowsInFile: records.length,
        savedCount: savedReceipts.length,
        duplicateCount: duplicatesList.length,
        duplicates: duplicatesList,
        missingCount: missingDetails.length,
        missingDetails,
        receipts: savedReceipts,
        status: 'Active',
        uploadedAt: new Date(),
      });

      const errorDetails: Array<{ row?: number; receipt?: string; warehouse?: string; errorType: string; reason: string }> = [
        ...duplicatesList.map((d) => ({
          row: d.row,
          receipt: d.receipt,
          warehouse: d.warehouse,
          errorType: 'Duplicate Receipt',
          reason: d.reason,
        })),
        ...missingDetails.map((m) => ({
          row: m.row,
          receipt: '',
          warehouse: defaultWarehouse,
          errorType: 'Missing Mandatory Field',
          reason: m.reason,
        })),
      ];

      const message = savedReceipts.length > 0
        ? `China Warehouse Inward: Successfully uploaded ${savedReceipts.length} unique cargo record(s) in '${defaultWarehouse}'.${duplicatesList.length > 0 ? ` Skipped ${duplicatesList.length} duplicate receipt(s) (list provided).` : ''}${missingDetails.length > 0 ? ` Skipped ${missingDetails.length} row(s) missing mandatory receipt/date.` : ''}`
        : `No records uploaded: ${duplicatesList.length} duplicate receipt(s) and ${missingDetails.length} row(s) with missing receipt/date were skipped.`;

      if (savedReceipts.length > 0) {
        await recordEditLog(req, {
          action: 'CREATE',
          entityType: 'WarehouseStock',
          entityId: uploadBatchId,
          description: `Uploaded warehouse stock file '${file.name}' (${savedReceipts.length} records saved, warehouse: ${defaultWarehouse})`,
          details: {
            fileName: file.name,
            warehouse: defaultWarehouse,
            savedCount: savedReceipts.length,
            duplicateCount: duplicatesList.length,
            missingCount: missingDetails.length,
          },
        });
      }

      return NextResponse.json({
        success: savedReceipts.length > 0,
        type: 'warehouse-receipts',
        uploadId: uploadBatchId,
        message,
        insertedCount: savedReceipts.length,
        savedCount: savedReceipts.length,
        duplicateCount: duplicatesList.length,
        duplicates: duplicatesList,
        missingCount: missingDetails.length,
        missingDetails,
        errorDetails,
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
          containerNumber: m.containerNumber || '',
          shippingLine: m.shippingLine || 'Default',
        });
      }
    });

    const existingContainers = await Container.find({}).select('container containerNumber shippingLine').lean();
    const existingContainerMap = new Map<string, any>();
    existingContainers.forEach((c: any) => {
      if (c.container) {
        existingContainerMap.set(c.container.toUpperCase().trim(), c);
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

    // 1. Gather all requested receipts & sum quantities, volume, and weight in uploaded file by (WAREHOUSE, RECEIPT)
    // Mandatory Rule: Both Warehouse Name and Receipt No. are strictly required to load goods and deduct warehouse stock!
    const fileQtyByKey = new Map<string, number>();
    const fileCbmByKey = new Map<string, number>();
    const fileWeightByKey = new Map<string, number>();
    const fileReceiptRows = new Map<string, number[]>();
    const fileKeyToMeta = new Map<string, { warehouse: string; receipt: string; entry?: string }>();
    const containerToActualMap = new Map<string, string>();
    const containerToWarehouseMap = new Map<string, string>();
    const missingPlanDetails: Array<{ row: number; reason: string }> = [];

    const isIsoContainer = (v: string) => /^[A-Z]{4}\d{6,7}$/i.test(String(v || '').replace(/[\s-_]/g, ''));

    for (let index = 0; index < records.length; index++) {
      const row = records[index];
      let containerVal = containerHeader && row[containerHeader] !== undefined ? String(row[containerHeader]).trim().toUpperCase() : '';
      if (!containerVal && targetContainer) {
        containerVal = targetContainer;
      }
      if (!containerVal) continue;

      let actualVal = actualContainerHeader && row[actualContainerHeader] !== undefined ? String(row[actualContainerHeader]).trim().toUpperCase() : '';

      // If containerVal has standard ISO 6346 container number (like GESU6221024) and actualVal is internal alias (like USSI-358), swap them
      if (isIsoContainer(containerVal) && actualVal && !isIsoContainer(actualVal)) {
        const tmp = containerVal;
        containerVal = actualVal;
        actualVal = tmp;
      }

      if (actualVal && !containerToActualMap.has(containerVal)) {
        containerToActualMap.set(containerVal, actualVal);
      }

      const rVal = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
      if (!rVal) {
        missingPlanDetails.push({ row: index + 2, reason: `Row ${index + 2}: Missing mandatory Receipt Number (Receipt No. is required)` });
        continue;
      }

      const rawEntry = warehouseEntryHeader && row[warehouseEntryHeader] !== undefined ? String(row[warehouseEntryHeader]).trim() : '';
      const rawWh = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : '';
      const determinedWh = rawWh || rawEntry || defaultWarehouse;

      if (!determinedWh) {
        missingPlanDetails.push({ row: index + 2, reason: `Row ${index + 2} (Receipt #${rVal}): Missing mandatory Warehouse Name (Warehouse is required)` });
        continue;
      }

      const rowWarehouse = normalizeWarehouse(determinedWh, rawEntry);

      if (!containerToWarehouseMap.has(containerVal)) {
        containerToWarehouseMap.set(containerVal, rowWarehouse);
      }

      const cleanR = rVal.trim();
      const rawQ = quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '0';
      const q = parseInt(rawQ, 10) || 0;
      const rawCbm = volumeHeader && row[volumeHeader] !== undefined ? parseMetricNumber(row[volumeHeader]) : 0;
      const rawWeight = weightHeader && row[weightHeader] !== undefined ? parseMetricNumber(row[weightHeader]) : 0;

      const compoundKey = `${rowWarehouse.toLowerCase()}___${cleanR.toLowerCase()}`;

      fileQtyByKey.set(compoundKey, (fileQtyByKey.get(compoundKey) || 0) + q);
      fileCbmByKey.set(compoundKey, (fileCbmByKey.get(compoundKey) || 0) + rawCbm);
      fileWeightByKey.set(compoundKey, (fileWeightByKey.get(compoundKey) || 0) + rawWeight);
      if (!fileReceiptRows.has(compoundKey)) fileReceiptRows.set(compoundKey, []);
      fileReceiptRows.get(compoundKey)!.push(index + 1);
      if (!fileKeyToMeta.has(compoundKey)) {
        fileKeyToMeta.set(compoundKey, { warehouse: rowWarehouse, receipt: cleanR, entry: rawEntry });
      }
    }

    // 2. Fetch existing WarehouseReceipt stock for all receipts in the file
    const allReceiptNumbers = Array.from(new Set(Array.from(fileKeyToMeta.values()).map((m) => m.receipt)));
    let existingWhReceipts: any[] = [];
    if (allReceiptNumbers.length > 0) {
      const orConditions = allReceiptNumbers.map((r) => ({
        receipt: new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }));
      existingWhReceipts = await WarehouseReceipt.find({ $or: orConditions }).lean();
    }

    const whReceiptMap = new Map<string, any>();
    const receiptToAllDocsMap = new Map<string, any[]>();

    existingWhReceipts.forEach((wh: any) => {
      const exactKey = `${String(wh.warehouse).toLowerCase().trim()}___${String(wh.receipt).toLowerCase().trim()}`;
      whReceiptMap.set(exactKey, wh);

      const rKey = String(wh.receipt).toLowerCase().trim();
      if (!receiptToAllDocsMap.has(rKey)) receiptToAllDocsMap.set(rKey, []);
      receiptToAllDocsMap.get(rKey)!.push(wh);
    });

    // 3. Validation & Exception Detection: Check Receipt existence and evaluate metric discrepancies
    const validationErrors: string[] = [];
    const splitWarnings: any[] = [];
    const detectedMismatches: any[] = [];
    const errorDetails: Array<{ row?: number; receipt?: string; warehouse?: string; errorType: string; reason: string }> = [];

    for (const [key, requestedQty] of fileQtyByKey.entries()) {
      let wh = whReceiptMap.get(key);
      const meta = fileKeyToMeta.get(key)!;
      const rows = fileReceiptRows.get(key) || [];
      const rKey = meta.receipt.toLowerCase().trim();
      const allMatchesForReceipt = receiptToAllDocsMap.get(rKey) || [];

      // If exact compound key didn't match directly, intelligently resolve warehouse stock
      if (!wh && allMatchesForReceipt.length > 0) {
        // A. Match by entryCode if provided (e.g. RS-21 -> GZ stock, AS-14 -> YW stock)
        if (meta.entry) {
          wh = allMatchesForReceipt.find(
            (d) => d.warehouseEntry && d.warehouseEntry.toUpperCase() === meta.entry!.toUpperCase()
          );
        }
        // B. If receipt exists in ONLY ONE warehouse in DB, match that record!
        if (!wh && allMatchesForReceipt.length === 1) {
          wh = allMatchesForReceipt[0];
        }
        // C. Match normalized warehouse
        if (!wh) {
          wh = allMatchesForReceipt.find(
            (d) => normalizeWarehouse(d.warehouse, d.warehouseEntry) === meta.warehouse
          );
        }

        if (wh) {
          whReceiptMap.set(key, wh);
        }
      }

      // A. Check Receipt Existence in DB
      if (!wh) {
        const errorMsg = `Receipt '${meta.receipt}' does not exist in '${meta.warehouse}' warehouse DB stock. Please fetch it from the China warehouse portal or inward stock first.`;
        validationErrors.push(errorMsg);
        for (const rNum of rows) {
          errorDetails.push({
            row: rNum + 1,
            receipt: meta.receipt,
            warehouse: meta.warehouse,
            errorType: 'Receipt Not in DB Stock',
            reason: `Receipt #${meta.receipt} does not exist in ${meta.warehouse} warehouse inventory. Click 'Fetch from China' to ingest directly into DB.`,
          });
        }
        continue;
      }

      // B. Evaluate Metrics Mismatch (Carton, CBM, Weight) against DB Received Stock
      const requestedCbm = fileCbmByKey.get(key) || 0;
      const dbCbm = parseMetricNumber(wh.volume);
      const requestedWeight = fileWeightByKey.get(key) || 0;
      const dbWeight = parseMetricNumber(wh.weight);

      const evalRes = evaluateMetricsMismatch(wh.quantity, requestedQty, dbCbm, requestedCbm, dbWeight, requestedWeight);
      if (evalRes.hasMismatch) {
        detectedMismatches.push({
          receipt: wh.receipt,
          warehouse: wh.warehouse,
          rows,
          requestedQty,
          dbQty: wh.quantity,
          cartonDiff: evalRes.carton.diff,
          requestedCbm,
          dbCbm,
          cbmDiff: evalRes.cbm.diff,
          requestedWeight,
          dbWeight,
          weightDiff: evalRes.weight.diff,
          category: evalRes.category,
          categoryLabel: evalRes.categoryLabel,
          categoryGroup: evalRes.categoryGroup,
          summary: evalRes.summary,
        });
      }

      const available = wh.remainingQuantity !== undefined ? wh.remainingQuantity : (wh.quantity - (wh.loadedQuantity || 0));
      if (requestedQty < available) {
        splitWarnings.push({
          receipt: wh.receipt,
          requestedQty,
          availableQty: available,
          remainingAfter: available - requestedQty,
          warehouse: wh.warehouse || meta.warehouse,
          party: wh.party || 'General Party',
        });
      }
    }

    // Missing receipt in DB is a blocking error
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: `Loading Plan validation failed for ${validationErrors.length} issue(s): ` + validationErrors.slice(0, 3).join(' | ') + (validationErrors.length > 3 ? ` (+${validationErrors.length - 3} more)` : ''),
          validationErrors,
          errorDetails,
        },
        { status: 400 }
      );
    }

    // Prompt user for actual quantities confirmation if discrepancies exist and not yet confirmed
    if (detectedMismatches.length > 0 && !confirmActual) {
      return NextResponse.json({
        requiresActualConfirmation: true,
        message: `Notice: Loading list contains actual quantity, CBM, or weight discrepancies across ${detectedMismatches.length} receipt(s) compared to warehouse received stock.\n\nActual quantities from the loading sheet will be recorded, and discrepancies will be routed to the Sales Head Exception Report. Confirm to proceed.`,
        detectedMismatches,
        totalMismatches: detectedMismatches.length,
      });
    }

    // If user is loading less quantity than received stock (splitting cargo) and has not confirmed yet:
    if (splitWarnings.length > 0 && !confirmSplit && !confirmActual) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: `Notice: Loading less goods than received for ${splitWarnings.length} receipt(s). This will split the cargo across containers. Please confirm to proceed.`,
        splitWarnings,
      });
    }

    const bulkOperations = [];

    for (let index = 0; index < records.length; index++) {
      const row = records[index];
      let containerVal = containerHeader && row[containerHeader] !== undefined ? String(row[containerHeader]).trim().toUpperCase() : '';
      if (!containerVal && targetContainer) {
        containerVal = targetContainer;
      }
      if (!containerVal) continue;

      let actualVal = actualContainerHeader && row[actualContainerHeader] !== undefined ? String(row[actualContainerHeader]).trim().toUpperCase() : '';

      // If containerVal has standard ISO 6346 container number and actualVal is internal alias, swap them
      if (isIsoContainer(containerVal) && actualVal && !isIsoContainer(actualVal)) {
        const tmp = containerVal;
        containerVal = actualVal;
        actualVal = tmp;
      }

      const rawReceipt = receiptHeader && row[receiptHeader] !== undefined ? String(row[receiptHeader]).trim() : '';
      if (!rawReceipt) {
        continue;
      }

      const rawDate = dateHeader && row[dateHeader] !== undefined ? String(row[dateHeader]).trim() : '';
      const formattedDate = formatReceiptDate(rawDate) || rawDate;
      if (!formattedDate) {
        missingPlanDetails.push({ row: index + 2, reason: `Row ${index + 2} (Receipt #${rawReceipt}): Missing mandatory Date in loading plan` });
        continue;
      }

      const receiptVal = rawReceipt;

      // Internal container alias lookup
      const existingC = existingContainerMap.get(containerVal) || mappingMap.get(containerVal);
      // ACTUAL container number is mapped from upload file or existing allocation
      const finalContainerNumber = actualVal || containerToActualMap.get(containerVal) || existingC?.containerNumber || '';
      const finalShippingLine = existingC?.shippingLine || (shippingLineHeader && row[shippingLineHeader] ? String(row[shippingLineHeader]).trim() : 'MSC');

      const partyVal = partyHeader && row[partyHeader] !== undefined && String(row[partyHeader]).trim()
        ? String(row[partyHeader]).trim()
        : 'General Party';

      // Commodity & English with automatic Chinese-to-English translation via Gemini AI
      const rawCommodity = commodityHeader && row[commodityHeader] !== undefined ? String(row[commodityHeader]).trim() : '';
      const rawEnglish = englishHeader && row[englishHeader] !== undefined ? String(row[englishHeader]).trim() : '';

      let finalEnglish = '';
      if (hasChineseCharacters(rawEnglish)) {
        finalEnglish = aiTranslationMap[rawEnglish] || translateToEnglish(rawEnglish);
      } else if (rawEnglish && rawEnglish !== 'General Merchandise') {
        finalEnglish = rawEnglish;
      } else if (hasChineseCharacters(rawCommodity)) {
        finalEnglish = aiTranslationMap[rawCommodity] || translateCommodity(rawCommodity).english;
      } else {
        finalEnglish = rawCommodity || 'General Goods';
      }

      const finalChinese = hasChineseCharacters(rawCommodity) ? rawCommodity : (hasChineseCharacters(rawEnglish) ? rawEnglish : '');

      const rawPackaging = packagingHeader && row[packagingHeader] !== undefined ? String(row[packagingHeader]).trim() : '';
      const finalPackaging = hasChineseCharacters(rawPackaging)
        ? (aiTranslationMap[rawPackaging] || translatePackaging(rawPackaging) || 'Carton')
        : (translatePackaging(rawPackaging) || 'Carton');

      const rawEntry = warehouseEntryHeader && row[warehouseEntryHeader] !== undefined ? String(row[warehouseEntryHeader]).trim() : '';
      const rawWh = warehouseHeader && row[warehouseHeader] !== undefined ? String(row[warehouseHeader]).trim() : '';
      const finalWarehouse = normalizeWarehouse(rawWh || defaultWarehouse, rawEntry);

      const finalMainMark = translateMark(mainMarkHeader && row[mainMarkHeader] !== undefined ? String(row[mainMarkHeader]).trim() : '');
      const finalSubMark = translateMark(subMarkHeader && row[subMarkHeader] !== undefined ? String(row[subMarkHeader]).trim() : '');
      const destVal = destinationHeader && row[destinationHeader] ? String(row[destinationHeader]).trim() : 'Nhava Sheva / Mundra, India';

      // Additional fields in user format
      const rawPlate = plateHeader && row[plateHeader] !== undefined ? String(row[plateHeader]).trim() : '';
      const rawPhone = phoneHeader && row[phoneHeader] !== undefined ? String(row[phoneHeader]).trim() : '';
      const rawDelivery = deliveryHeader && row[deliveryHeader] !== undefined ? String(row[deliveryHeader]).trim() : '';
      const finalDelivery = hasChineseCharacters(rawDelivery) ? (aiTranslationMap[rawDelivery] || translateToEnglish(rawDelivery)) : rawDelivery;
      const rawType = typeHeader && row[typeHeader] !== undefined ? String(row[typeHeader]).trim() : '';
      const rawStockStatus = stockStatusHeader && row[stockStatusHeader] !== undefined ? String(row[stockStatusHeader]).trim() : '';
      const finalStockStatus = hasChineseCharacters(rawStockStatus) ? (aiTranslationMap[rawStockStatus] || 'In Stock') : (rawStockStatus || 'In Stock');

      // ETA & Status from file if present
      const fileEta = etaHeader && row[etaHeader] !== undefined ? String(row[etaHeader]).trim() : '';
      const fileStatus = statusHeader && row[statusHeader] !== undefined ? String(row[statusHeader]).trim() : '';

      const rowRate = rateHeader && row[rateHeader] !== undefined ? String(row[rateHeader]).trim() : '';
      const rowRateUnit = rateUnitHeader && row[rateUnitHeader] !== undefined ? String(row[rateUnitHeader]).trim() : 'CTN';
      const rowCost = costHeader && row[costHeader] !== undefined ? String(row[costHeader]).trim() : '';
      const rowRemarks = remarksHeader && row[remarksHeader] !== undefined ? String(row[remarksHeader]).trim() : '';
      const rowRateFixed = rateFixedHeader && row[rateFixedHeader] !== undefined ? Boolean(row[rateFixedHeader]) : false;
      const rowIsLabbler = Boolean(rowRemarks || (remarksHeader && /labell?er/i.test(rowRemarks)));

      const finalItemName = finalEnglish || rawCommodity || 'General Goods';
      const rowQtyNum = parseInt(String((quantityHeader && row[quantityHeader]) || 0), 10) || 0;
      const rowGoodsItems = [{
        name: finalItemName,
        rate: rowRate,
        rateUnit: rowRateUnit,
        ctn: rowQtyNum,
        cbm: volumeHeader && row[volumeHeader] !== undefined ? String(row[volumeHeader]).trim() : '',
        weight: weightHeader && row[weightHeader] !== undefined ? String(row[weightHeader]).trim() : '',
        cost: rowCost,
        remarks: rowRemarks,
      }];

      const updatePayload: Record<string, any> = {
        receipt: receiptVal,
        party: partyVal,
        container: containerVal,
        containerNumber: finalContainerNumber,
        shippingLine: finalShippingLine,
        uploadBatchId,
        stockstatus: finalStockStatus,
        warehouse: finalWarehouse,
        date: formattedDate,
        warehouseEntry: rawEntry,
        quantity: quantityHeader && row[quantityHeader] !== undefined ? String(row[quantityHeader]).trim() : '',
        weight: weightHeader && row[weightHeader] !== undefined ? String(row[weightHeader]).trim() : '',
        volume: volumeHeader && row[volumeHeader] !== undefined ? String(row[volumeHeader]).trim() : '',
        commodity: finalItemName,
        chinese: finalChinese,
        english: finalItemName,
        packaging: finalPackaging,
        subMarka: finalSubMark,
        mainMarka: finalMainMark,
        shippedTo: destVal,
        rate: rowRate,
        rateFixed: rowRateFixed,
        totalCost: rowCost,
        cost: rowCost,
        remarks: rowRemarks,
        isLabblerGoods: rowIsLabbler,
        goodsItems: rowGoodsItems,
        plate: rawPlate,
        phone: rawPhone,
        delivery: finalDelivery,
        type: rawType,
      };

      const rowKey = `${finalWarehouse.toLowerCase()}___${receiptVal.toLowerCase()}`;
      const wh = whReceiptMap.get(rowKey);
      const totalLoadQtyForReceipt = fileQtyByKey.get(rowKey) || 0;
      const isSplitItem = (wh && totalLoadQtyForReceipt < wh.quantity) || (wh && (wh.loadedQuantity || 0) > 0);
      updatePayload.isSplit = Boolean(isSplitItem);
      updatePayload.originalTotalQuantity = wh ? String(wh.quantity) : updatePayload.quantity;
      if (wh?._id) updatePayload.receiptId = wh._id;
      if (!updatePayload.rate && wh?.rate) updatePayload.rate = wh.rate;
      if (updatePayload.rateFixed === false && wh?.rateFixed) updatePayload.rateFixed = wh.rateFixed;

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

    // 4. Synchronously update WarehouseReceipt loaded quantities, volume, weight, and remaining stock balances
    for (const [key, loadedQty] of fileQtyByKey.entries()) {
      const wh = whReceiptMap.get(key);
      if (wh) {
        const loadedCbm = fileCbmByKey.get(key) || 0;
        const loadedWeight = fileWeightByKey.get(key) || 0;

        const newLoaded = (wh.loadedQuantity || 0) + loadedQty;
        const newRemaining = Math.max(0, wh.quantity - newLoaded);

        const origCbm = parseMetricNumber(wh.volume);
        const origWeight = parseMetricNumber(wh.weight);

        const newLoadedCbm = Number(((parseMetricNumber(wh.loadedVolume) || 0) + loadedCbm).toFixed(3));
        const newRemainingCbm = Math.max(0, Number((origCbm - newLoadedCbm).toFixed(3)));

        const newLoadedWeight = Number(((parseMetricNumber(wh.loadedWeight) || 0) + loadedWeight).toFixed(3));
        const newRemainingWeight = Math.max(0, Number((origWeight - newLoadedWeight).toFixed(3)));

        const hasDelivered = Boolean(wh.isDelivered || wh.status === 'Partially Delivered' || wh.status === 'Delivered');
        const newStatus = hasDelivered ? 'Partially Delivered' : (newRemaining === 0 ? 'Fully Loaded' : 'Partially Loaded');
        const newStockStatus = hasDelivered ? 'Partially Delivered' : (newRemaining === 0 ? 'Dispatched' : 'Partially Dispatched');

        const originalName = wh.commodity || wh.english || 'General Goods';
        const balanceItem = {
          name: originalName,
          ctn: newRemaining,
          cbm: newRemainingCbm,
          weight: newRemainingWeight,
        };

        const evalM = evaluateMetricsMismatch(wh.quantity, newLoaded, origCbm, newLoadedCbm, origWeight, newLoadedWeight);

        await WarehouseReceipt.updateOne(
          { _id: wh._id },
          {
            $set: {
              loadedQuantity: newLoaded,
              remainingQuantity: newRemaining,
              loadedVolume: newLoadedCbm,
              remainingVolume: newRemainingCbm,
              loadedWeight: newLoadedWeight,
              remainingWeight: newRemainingWeight,
              balanceItem,
              status: newStatus,
              stockstatus: newStockStatus,
              isDelivered: false,
              hasMismatch: evalM.hasMismatch,
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
      const existingC = existingContainerMap.get(cAlias);
      const actualFromUpload = containerToActualMap.get(cAlias) || '';
      const finalActualNumber = actualFromUpload || existingC?.containerNumber || '';
      const finalIsFinalized = Boolean(finalActualNumber && finalActualNumber.trim().length > 0);
      const containerWh = containerToWarehouseMap.get(cAlias) || defaultWarehouse;

      let resolvedShippingLine = existingC?.shippingLine || mappingMap.get(cAlias)?.shippingLine;
      if ((!resolvedShippingLine || resolvedShippingLine === 'MSC') && finalActualNumber) {
        try {
          const detected = await detectCarrierWithGemini(finalActualNumber, resolvedShippingLine);
          if (detected.canonicalCode) {
            resolvedShippingLine = detected.canonicalCode;
          }
          await ensureShippingLineExists(detected);
        } catch {}
      }
      if (!resolvedShippingLine) resolvedShippingLine = 'MSC';

      await Container.findOneAndUpdate(
        { container: cAlias },
        {
          $set: {
            container: cAlias,
            planNumber: cAlias,
            containerNumber: finalActualNumber,
            shippingLine: resolvedShippingLine,
            warehouse: containerWh,
            planStatus: finalIsFinalized ? 'Finalized' : 'Loaded',
            isFinalized: finalIsFinalized,
            status: 'Loaded',
          },
          $setOnInsert: {
            shippedFrom: `${containerWh}, China`,
            shippedTo: 'Nhava Sheva / Mundra, India',
            eta: 'Pending',
          },
        },
        { upsert: true }
      );

      // Also ensure all shipments under this container have the detected shippingLine
      if (resolvedShippingLine && resolvedShippingLine !== 'MSC') {
        await Shipment.updateMany(
          { container: cAlias },
          { $set: { shippingLine: resolvedShippingLine } }
        );
      }

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

    // Record Loading Plan upload into UploadHistory tracking collection
    const uploadedReceiptList = Array.from(fileQtyByKey.values()).map((_, i) => Array.from(fileKeyToMeta.values())[i]?.receipt || '');
    await UploadHistory.create({
      uploadId: uploadBatchId,
      fileName: file.name,
      uploadType: 'plan',
      warehouse: defaultWarehouse,
      targetContainer: targetContainer || (distinctUploadContainers[0] || ''),
      totalRowsInFile: records.length,
      savedCount: countInserted || bulkOperations.length,
      duplicateCount: 0,
      duplicates: [],
      missingCount: missingPlanDetails.length,
      missingDetails: missingPlanDetails,
      receipts: uploadedReceiptList,
      status: 'Active',
      uploadedAt: new Date(),
    });

    missingPlanDetails.forEach((m) => {
      errorDetails.push({
        row: m.row,
        receipt: '',
        warehouse: defaultWarehouse,
        errorType: 'Missing Mandatory Field',
        reason: m.reason,
      });
    });

    // Record Edit Log for Loading Plan upload
    await recordEditLog(req, {
      action: 'CREATE',
      entityType: 'LoadingPlan',
      entityId: uploadBatchId,
      description: `Uploaded loading plan file '${file.name}' (${countInserted || bulkOperations.length} records, container: ${targetContainer || distinctUploadContainers[0] || 'N/A'})`,
      details: {
        fileName: file.name,
        targetContainer: targetContainer || distinctUploadContainers[0] || '',
        savedCount: countInserted || bulkOperations.length,
        totalRows: records.length,
      },
    });

    // JSONCargo API is NOT called during upload to preserve API quota and prevent timeouts.
    return NextResponse.json({
      success: true,
      uploadId: uploadBatchId,
      message: importMode === 'update'
        ? `Loading Plan Processed: ${countInserted} new records inserted, ${countModified} updated.` + (detectedMismatches.length > 0 ? ` (${detectedMismatches.length} discrepancies routed to Sales Head Exception Report).` : '')
        : `Loading Plan Processed: Successfully added ${countInserted || bulkOperations.length} cargo records with actual quantities to internal container plan(s).` + (detectedMismatches.length > 0 ? ` (${detectedMismatches.length} discrepancies routed to Sales Head Exception Report).` : ''),
      insertedCount: countInserted || bulkOperations.length,
      savedCount: countInserted || bulkOperations.length,
      updatedCount: countModified,
      mismatchesCount: detectedMismatches.length,
      detectedMismatches,
      missingCount: missingPlanDetails.length,
      missingDetails: missingPlanDetails,
      errorDetails,
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
        rate: rateHeader,
        rateUnit: rateUnitHeader,
        cost: costHeader,
        remarks: remarksHeader,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'File upload failed' }, { status: 500 });
  }
}
