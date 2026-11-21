/**
 * China Warehouse Synchronization & Mismatch Verification Engine
 * Implements automated ingestion, Gemini AI translation, warehouse-scoped isolation,
 * mismatch detection (protecting local warehouse edits), and audit workflows.
 */

import { connectToDatabase } from '@/lib/mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import ChinaSyncMismatch, { MismatchType } from '@/models/ChinaSyncMismatch';
import {
  ChinaWarehouseClient,
  ChinaWarehouseRecord,
  getDateRange,
} from '@/lib/chinaWarehouseClient';
import { batchTranslateWithGemini } from '@/lib/geminiTranslate';
import { translatePackaging, translateMark } from '@/lib/translate';
import { indexSingleWarehouseReceipt } from '@/lib/typesense';

export type SyncMode = 'sync' | 'verify_24h' | 'audit_sunday' | 'audit_month';

export interface SyncEngineResult {
  success: boolean;
  mode: SyncMode;
  timestamp: string;
  durationMs: number;
  totalChecked: number;
  insertedCount: number;
  matchedCount: number;
  mismatchCount: number;
  verifiedCount: number;
  warehouses: {
    GZ: { checked: number; inserted: number; mismatches: number; verified: number };
    YW: { checked: number; inserted: number; mismatches: number; verified: number };
  };
  details?: string[];
}

export async function runChinaWarehouseSync(
  options: {
    mode?: SyncMode;
    warehouse?: 'GZ' | 'YW' | 'ALL';
    daysBack?: number;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<SyncEngineResult> {
  const startTime = Date.now();
  await connectToDatabase();

  const mode = options.mode || 'sync';
  const targetWh = options.warehouse || 'ALL';

  let days = options.daysBack;
  if (days === undefined) {
    if (mode === 'verify_24h') days = 2; // Last 24-48 hours
    else if (mode === 'audit_sunday') days = 7; // Last 7 days (weekly)
    else if (mode === 'audit_month') days = 30; // Last 30 days (monthly)
    else days = 3; // Regular sync: recent 3 days of cargo
  }

  const dateRange = options.startDate && options.endDate
    ? { startDate: options.startDate, endDate: options.endDate }
    : getDateRange(days);

  const client = new ChinaWarehouseClient();
  const whList: Array<'GZ' | 'YW'> =
    targetWh === 'ALL' ? ['GZ', 'YW'] : [targetWh];

  const overall = {
    totalChecked: 0,
    insertedCount: 0,
    matchedCount: 0,
    mismatchCount: 0,
    verifiedCount: 0,
    warehouses: {
      GZ: { checked: 0, inserted: 0, mismatches: 0, verified: 0 },
      YW: { checked: 0, inserted: 0, mismatches: 0, verified: 0 },
    },
    details: [] as string[],
  };

  const auditPeriod =
    mode === 'verify_24h'
      ? 'DAILY_24H'
      : mode === 'audit_sunday'
      ? 'WEEKLY_7D'
      : mode === 'audit_month'
      ? 'MONTHLY_30D'
      : 'REALTIME';

  for (const wh of whList) {
    try {
      // 1. Fetch records from China warehouse portal
      const portalRecords: ChinaWarehouseRecord[] = await client.fetchAllRecords(wh, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limitPerPage: 200,
        maxPages: mode === 'audit_month' ? 40 : 15,
      });

      overall.totalChecked += portalRecords.length;
      overall.warehouses[wh].checked = portalRecords.length;

      if (portalRecords.length === 0) {
        overall.details.push(`Warehouse ${wh}: 0 records returned for range ${dateRange.startDate} to ${dateRange.endDate}`);
        continue;
      }

      // 2. Collect unique Chinese strings for batch Gemini translation
      const termsToTranslate: string[] = [];
      for (const rec of portalRecords) {
        if (rec.commodity) termsToTranslate.push(rec.commodity);
        if (rec.packaging) termsToTranslate.push(rec.packaging);
        if (rec.remark) termsToTranslate.push(rec.remark);
      }

      const translationMap = await batchTranslateWithGemini(termsToTranslate);

      // 3. Query existing WarehouseReceipt records in DB for this warehouse
      const portalCodes = portalRecords.map((r) => r.code).filter(Boolean);
      const existingInDb = await WarehouseReceipt.find({
        warehouse: wh,
        receipt: { $in: portalCodes },
      }).lean();

      const existingMap = new Map<string, any>();
      for (const doc of existingInDb) {
        existingMap.set(String(doc.receipt).trim().toLowerCase(), doc);
      }

      // 4. Process each portal record
      for (const item of portalRecords) {
        if (!item.code) continue;
        const codeKey = item.code.trim().toLowerCase();
        const existing = existingMap.get(codeKey);

        const translatedCommodity =
          translationMap[item.commodity] || item.commodity || 'General Merchandise';
        const translatedPackaging =
          translationMap[item.packaging] || translatePackaging(item.packaging) || 'Carton';
        const cleanMark = translateMark(item.mark) || item.mark || '';

        // ---------------------------------------------------------------------
        // CASE A: NEW RECEIPT -> Save into DB
        // ---------------------------------------------------------------------
        if (!existing) {
          const uploadBatchId = `SYNC-AUTO-${Date.now()}`;
          const isVerified = mode === 'verify_24h' || mode === 'audit_sunday';

          const receiptDoc = new WarehouseReceipt({
            receipt: item.code,
            party: item.customerName || 'General Party',
            warehouse: wh,
            warehouseEntry: item.entryCode || (wh === 'GZ' ? 'RS-21' : 'AS-14'),
            date: item.formattedDate || new Date().toISOString().slice(0, 10),
            quantity: item.actualQuantity,
            loadedQuantity: 0,
            remainingQuantity: item.actualQuantity,
            weight: item.weight,
            loadedWeight: 0,
            remainingWeight: item.weight,
            volume: item.volume,
            loadedVolume: 0,
            remainingVolume: item.volume,
            commodity: translatedCommodity,
            chinese: item.commodity,
            english: translatedCommodity,
            packaging: translatedPackaging,
            mainMarka: cleanMark,
            subMarka: '',
            status: 'Received in Warehouse',
            stockstatus: 'In Stock',
            notes: item.remark || '',
            remarks: item.remark || '',
            phone: item.phone || '',
            isDelivered: false,
            isVerified,
            verifiedAt: isVerified ? new Date() : null,
            lastChinaSyncAt: new Date(),
            chinaId: item.id,
            chinaStockState: item.stockState,
            hasMismatch: false,
            items: [
              {
                itemName: translatedCommodity,
                english: translatedCommodity,
                chinese: item.commodity,
                quantity: item.actualQuantity,
                packaging: translatedPackaging,
                weight: item.weight,
                volume: item.volume,
                rate: '',
                rateUnit: 'CTN',
                cost: '',
                remarks: item.remark || '',
                mainMarka: cleanMark,
                subMarka: '',
              },
            ],
            balanceItem: {
              name: translatedCommodity,
              ctn: item.actualQuantity,
              cbm: item.volume,
              weight: item.weight,
            },
            loadedItems: [],
            uploadBatchId,
            uploadedAt: new Date(),
          });

          await receiptDoc.save();
          existingMap.set(codeKey, receiptDoc.toObject());

          overall.insertedCount++;
          overall.warehouses[wh].inserted++;

          // Attempt Typesense search indexing
          try {
            await indexSingleWarehouseReceipt(receiptDoc);
          } catch {
            // Non-blocking if typesense is not running
          }

          continue;
        }

        // ---------------------------------------------------------------------
        // CASE B: EXISTING RECEIPT -> Rule: DO NOT blindly overwrite our warehouse data!
        // Check for Mismatches / Receiving Discrepancies
        // Rule: In China warehouse, loaded cartons are deducted upon loading to containers.
        // Therefore: Balance available to load in DB (dbRemainingQty) = China warehouse stock (portalQty)!
        // ---------------------------------------------------------------------
        const dbQty = typeof existing.quantity === 'number' ? existing.quantity : parseInt(String(existing.quantity || 0), 10);
        const loadedQty = typeof existing.loadedQuantity === 'number' ? existing.loadedQuantity : parseInt(String(existing.loadedQuantity || 0), 10);
        const dbRemainingQty = existing.remainingQuantity !== undefined && existing.remainingQuantity !== null
          ? (typeof existing.remainingQuantity === 'number' ? existing.remainingQuantity : parseInt(String(existing.remainingQuantity || 0), 10))
          : Math.max(0, dbQty - loadedQty);
        const portalQty = item.actualQuantity;

        const dbWeight = parseFloat(String(existing.weight || 0)) || 0;
        const portalWeight = parseFloat(String(item.weight || 0)) || 0;
        const dbVolume = parseFloat(String(existing.volume || 0)) || 0;
        const portalVolume = parseFloat(String(item.volume || 0)) || 0;

        const dbRemainingWeight = existing.remainingWeight !== undefined && existing.remainingWeight !== null && existing.remainingWeight !== ''
          ? (parseFloat(String(existing.remainingWeight)) || 0)
          : (dbQty > 0 ? (dbWeight * dbRemainingQty) / dbQty : 0);

        const dbRemainingVolume = existing.remainingVolume !== undefined && existing.remainingVolume !== null && existing.remainingVolume !== ''
          ? (parseFloat(String(existing.remainingVolume)) || 0)
          : (dbQty > 0 ? (dbVolume * dbRemainingQty) / dbQty : 0);

        const mismatches: Array<{ type: MismatchType; reason: string }> = [];

        // 1. Quantity mismatch: China warehouse stock (actualQuantity) should match DB balance available to load (dbRemainingQty)
        if (dbRemainingQty !== portalQty) {
          mismatches.push({
            type: 'QUANTITY_MISMATCH',
            reason: `Quantity mismatch: DB balance to load is ${dbRemainingQty} ctn (Total: ${dbQty}, Loaded: ${loadedQty}), China Portal shows ${portalQty} ctn in stock (diff: ${portalQty - dbRemainingQty})`,
          });
        }

        // 2. Weight mismatch (> 0.5 kg difference against remaining warehouse stock)
        // Only verify weight if remaining quantity exists and portal provided weight
        if (dbRemainingQty > 0 && portalWeight > 0 && Math.abs(dbRemainingWeight - portalWeight) > 0.5) {
          mismatches.push({
            type: 'WEIGHT_MISMATCH',
            reason: `Weight mismatch: DB remaining stock has ${dbRemainingWeight.toFixed(2)} kg, China Portal shows ${portalWeight} kg`,
          });
        }

        // 3. Volume mismatch (> 0.05 CBM difference against remaining warehouse stock)
        // Only verify volume if remaining quantity exists and portal provided volume
        if (dbRemainingQty > 0 && portalVolume > 0 && Math.abs(dbRemainingVolume - portalVolume) > 0.05) {
          mismatches.push({
            type: 'VOLUME_MISMATCH',
            reason: `Volume mismatch: DB remaining stock has ${dbRemainingVolume.toFixed(3)} m³, China Portal shows ${portalVolume} m³`,
          });
        }

        // 4. Mark mismatch (if shipping mark was changed in China portal)
        const dbMark = (existing.mainMarka || '').trim().toUpperCase();
        const pMark = cleanMark.trim().toUpperCase();
        if (dbMark && pMark && dbMark !== pMark) {
          mismatches.push({
            type: 'MARK_MISMATCH',
            reason: `Shipping mark mismatch: DB has "${dbMark}", China Portal shows "${pMark}"`,
          });
        }

        // 5. Commodity mismatch (if commodity was altered in China portal)
        const dbChinese = (existing.chinese || '').trim();
        if (dbChinese && item.commodity && dbChinese !== item.commodity) {
          mismatches.push({
            type: 'COMMODITY_MISMATCH',
            reason: `Commodity name altered in portal: DB "${dbChinese}", Portal "${item.commodity}"`,
          });
        }

        // ---------------------------------------------------------------------
        // IF MISMATCHES DETECTED: Log into ChinaSyncMismatch & Flag Receipt
        // ---------------------------------------------------------------------
        if (mismatches.length > 0) {
          overall.mismatchCount += mismatches.length;
          overall.warehouses[wh].mismatches += mismatches.length;

          for (const m of mismatches) {
            await ChinaSyncMismatch.findOneAndUpdate(
              {
                receipt: item.code,
                warehouse: wh,
                mismatchType: m.type,
                status: 'PENDING',
              },
              {
                $set: {
                  diffSummary: m.reason,
                  dbData: {
                    quantity: dbQty,
                    loadedQuantity: existing.loadedQuantity,
                    remainingQuantity: existing.remainingQuantity,
                    weight: existing.weight,
                    volume: existing.volume,
                    commodity: existing.commodity,
                    chinese: existing.chinese,
                    english: existing.english,
                    mainMarka: existing.mainMarka,
                    status: existing.status,
                    stockstatus: existing.stockstatus,
                    date: existing.date,
                    isDelivered: existing.isDelivered,
                  },
                  portalData: {
                    actualQuantity: item.actualQuantity,
                    weight: item.weight,
                    volume: item.volume,
                    commodity: item.commodity,
                    packaging: item.packaging,
                    mark: item.mark,
                    stockState: item.stockState,
                    date: item.date,
                    customerName: item.customerName,
                    entryCode: item.entryCode,
                    remark: item.remark,
                  },
                  auditPeriod,
                  detectedAt: new Date(),
                },
              },
              { upsert: true, new: true }
            );
          }

          // Mark receipt as having an active mismatch
          await WarehouseReceipt.updateOne(
            { _id: existing._id },
            {
              $set: {
                hasMismatch: true,
                lastChinaSyncAt: new Date(),
                chinaId: item.id,
                chinaStockState: item.stockState,
              },
            }
          );
        } else {
          // ---------------------------------------------------------------------
          // NO MISMATCH -> Verify or Update Sync Heartbeat
          // ---------------------------------------------------------------------
          overall.matchedCount++;

          const updateFields: any = {
            hasMismatch: false,
            lastChinaSyncAt: new Date(),
            chinaId: item.id,
            chinaStockState: item.stockState,
          };

          // In 10 AM Daily Verification or Sunday Audit, mark as verified!
          if (mode === 'verify_24h' || mode === 'audit_sunday') {
            updateFields.isVerified = true;
            updateFields.verifiedAt = new Date();
            overall.verifiedCount++;
            overall.warehouses[wh].verified++;
          }

          await WarehouseReceipt.updateOne({ _id: existing._id }, { $set: updateFields });

          // Auto-resolve any prior pending mismatches for this receipt
          await ChinaSyncMismatch.updateMany(
            { receipt: item.code, warehouse: wh, status: 'PENDING' },
            {
              $set: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
                resolutionNotes: 'Auto-resolved: Values verified in sync',
              },
            }
          );
        }
      }

      overall.details.push(
        `Warehouse ${wh}: Checked ${portalRecords.length}, New Saved: ${overall.warehouses[wh].inserted}, Mismatches: ${overall.warehouses[wh].mismatches}, Verified: ${overall.warehouses[wh].verified}`
      );
    } catch (whErr: any) {
      console.error(`[China Sync Engine] Error syncing warehouse ${wh}:`, whErr);
      overall.details.push(`Warehouse ${wh} Error: ${whErr.message || String(whErr)}`);
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    mode,
    timestamp: new Date().toISOString(),
    durationMs,
    totalChecked: overall.totalChecked,
    insertedCount: overall.insertedCount,
    matchedCount: overall.matchedCount,
    mismatchCount: overall.mismatchCount,
    verifiedCount: overall.verifiedCount,
    warehouses: overall.warehouses,
    details: overall.details,
  };
}


/**
 * Fetch a single receipt directly from the China Warehouse portal by receipt code
 * with instant Gemini AI translation and direct DB save/update (1-Click Fetch).
 */
export async function fetchSingleReceiptFromChina(
  receiptCode: string,
  targetWh: 'GZ' | 'YW' | 'ALL' = 'ALL'
): Promise<{
  success: boolean;
  message: string;
  isNew?: boolean;
  warehouse?: string;
  receipt?: any;
  error?: string;
}> {
  await connectToDatabase();
  const cleanCode = String(receiptCode || '').trim();
  if (!cleanCode) {
    return { success: false, message: 'Receipt number is required', error: 'Empty receipt code' };
  }

  const client = new ChinaWarehouseClient();
  const whsToCheck: Array<'GZ' | 'YW'> = targetWh === 'ALL' ? ['GZ', 'YW'] : [targetWh];

  let foundRecord: ChinaWarehouseRecord | null = null;
  let foundWh: 'GZ' | 'YW' | null = null;

  for (const wh of whsToCheck) {
    try {
      const cookie = await client.login(wh);
      const res = await client.fetchBatch(wh, cookie, { code: cleanCode, limit: 10 });
      const match = res.records.find(
        (r) => r.code.trim().toLowerCase() === cleanCode.toLowerCase()
      );
      if (match) {
        foundRecord = match;
        foundWh = wh;
        break;
      }
    } catch (err: any) {
      console.warn(`[Single Fetch] Check in ${wh} failed:`, err.message);
    }
  }

  if (!foundRecord || !foundWh) {
    return {
      success: false,
      message: `Receipt #${cleanCode} not found in China warehouse portal (${targetWh}).`,
      error: 'Not found',
    };
  }

  // Translate Chinese terms with Gemini AI
  const terms = [foundRecord.commodity, foundRecord.packaging, foundRecord.remark].filter(Boolean);
  const transMap = await batchTranslateWithGemini(terms);

  const translatedCommodity =
    transMap[foundRecord.commodity] || foundRecord.commodity || 'General Goods';
  const translatedPackaging =
    transMap[foundRecord.packaging] || translatePackaging(foundRecord.packaging) || 'Carton';
  const cleanMark = translateMark(foundRecord.mark) || foundRecord.mark || '';

  // Check if exists in DB
  const existing = await WarehouseReceipt.findOne({
    receipt: new RegExp(`^${cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    warehouse: foundWh,
  });

  if (existing) {
    // Update existing with China's latest numbers
    // In China warehouse, loaded cartons are deducted when loaded to containers.
    // China warehouse actualQuantity represents the remaining stock (balance to load).
    const loadedQty = typeof existing.loadedQuantity === 'number' ? existing.loadedQuantity : (parseInt(String(existing.loadedQuantity || 0), 10) || 0);
    const portalInStock = foundRecord.actualQuantity;
    const remainingQty = portalInStock;
    const totalQty = loadedQty > 0 ? (loadedQty + remainingQty) : Math.max(existing.quantity || 0, portalInStock);

    existing.quantity = totalQty;
    existing.remainingQuantity = remainingQty;
    existing.remainingWeight = foundRecord.weight;
    existing.remainingVolume = foundRecord.volume;
    if (loadedQty === 0) {
      existing.weight = foundRecord.weight;
      existing.volume = foundRecord.volume;
    }
    existing.commodity = translatedCommodity;
    existing.chinese = foundRecord.commodity;
    existing.english = translatedCommodity;
    existing.packaging = translatedPackaging;
    if (cleanMark) existing.mainMarka = cleanMark;
    if (foundRecord.remark) {
      existing.notes = foundRecord.remark;
      existing.remarks = foundRecord.remark;
    }
    existing.chinaId = foundRecord.id;
    existing.chinaStockState = foundRecord.stockState;
    existing.lastChinaSyncAt = new Date();
    existing.isVerified = true;
    existing.verifiedAt = new Date();
    existing.hasMismatch = false;

    // Update balance item
    existing.balanceItem = {
      name: translatedCommodity,
      ctn: remainingQty,
      cbm: foundRecord.volume,
      weight: foundRecord.weight,
    };

    await existing.save();

    // Auto-resolve any pending mismatches
    await ChinaSyncMismatch.updateMany(
      { receipt: foundRecord.code, warehouse: foundWh, status: 'PENDING' },
      {
        $set: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionAction: 'ACCEPT_CHINA',
          resolutionNotes: 'Updated via 1-click single receipt fetch from China portal',
        },
      }
    );

    try {
      await indexSingleWarehouseReceipt(existing);
    } catch {}

    return {
      success: true,
      isNew: false,
      warehouse: foundWh,
      message: `Receipt #${cleanCode} (${foundWh}) successfully updated from China warehouse with Gemini AI translation.`,
      receipt: existing.toObject(),
    };
  } else {
    // Insert brand new receipt
    const uploadBatchId = `SYNC-CLICK-${Date.now()}`;
    const newDoc = new WarehouseReceipt({
      receipt: foundRecord.code,
      party: foundRecord.customerName || 'General Party',
      warehouse: foundWh,
      warehouseEntry: foundRecord.entryCode || (foundWh === 'GZ' ? 'RS-21' : 'AS-14'),
      date: foundRecord.formattedDate || new Date().toISOString().slice(0, 10),
      quantity: foundRecord.actualQuantity,
      loadedQuantity: 0,
      remainingQuantity: foundRecord.actualQuantity,
      weight: foundRecord.weight,
      loadedWeight: 0,
      remainingWeight: foundRecord.weight,
      volume: foundRecord.volume,
      loadedVolume: 0,
      remainingVolume: foundRecord.volume,
      commodity: translatedCommodity,
      chinese: foundRecord.commodity,
      english: translatedCommodity,
      packaging: translatedPackaging,
      mainMarka: cleanMark,
      subMarka: '',
      status: 'Received in Warehouse',
      stockstatus: 'In Stock',
      notes: foundRecord.remark || '',
      remarks: foundRecord.remark || '',
      phone: foundRecord.phone || '',
      isDelivered: false,
      isVerified: true,
      verifiedAt: new Date(),
      lastChinaSyncAt: new Date(),
      chinaId: foundRecord.id,
      chinaStockState: foundRecord.stockState,
      hasMismatch: false,
      items: [
        {
          itemName: translatedCommodity,
          english: translatedCommodity,
          chinese: foundRecord.commodity,
          quantity: foundRecord.actualQuantity,
          packaging: translatedPackaging,
          weight: foundRecord.weight,
          volume: foundRecord.volume,
          rate: '',
          rateUnit: 'CTN',
          cost: '',
          remarks: foundRecord.remark || '',
          mainMarka: cleanMark,
          subMarka: '',
        },
      ],
      balanceItem: {
        name: translatedCommodity,
        ctn: foundRecord.actualQuantity,
        cbm: foundRecord.volume,
        weight: foundRecord.weight,
      },
      loadedItems: [],
      uploadBatchId,
      uploadedAt: new Date(),
    });

    await newDoc.save();

    try {
      await indexSingleWarehouseReceipt(newDoc);
    } catch {}

    return {
      success: true,
      isNew: true,
      warehouse: foundWh,
      message: `Receipt #${cleanCode} (${foundWh}) fetched from China portal, translated by Gemini AI, and saved to DB.`,
      receipt: newDoc.toObject(),
    };
  }
}
