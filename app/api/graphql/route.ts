import { NextRequest, NextResponse } from 'next/server';
import { buildSchema, graphql } from 'graphql';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import { isAdminAuthenticated } from '@/lib/auth';
import { fetchContainerTracking, fetchApiKeyStats, addFilingBufferDays } from '@/lib/jsoncargo';
import { translateToEnglish } from '@/lib/translate';
import { calculatePublicDeliveryDate } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// In-Memory Fast Query Cache (60s TTL for ultra-fast GraphQL response)
const gqlCacheMap = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 60 * 1000;

// Define GraphQL Schema using Schema Definition Language (SDL)
const schema = buildSchema(`
  type Shipment {
    id: ID!
    receipt: String!
    party: String
    container: String!
    containerNumber: String
    shippingLine: String
    eta: String
    dateOfDelivery: String
    status: String
    lastApiSync: String
    warehouseEntry: String
    commodity: String
    chinese: String
    quantity: String
    weight: String
    volume: String
    english: String
    stockstatus: String
    warehouse: String
    packaging: String
    subMarka: String
    mainMarka: String
    date: String
    isSplit: Boolean
    splitIndex: Int
    originalTotalQuantity: String
    uploadedAt: String
  }

  type WarehouseReceipt {
    id: ID!
    receipt: String!
    party: String
    warehouse: String!
    warehouseEntry: String
    date: String
    quantity: Int!
    loadedQuantity: Int!
    remainingQuantity: Int!
    weight: String
    volume: String
    commodity: String
    chinese: String
    english: String
    packaging: String
    mainMarka: String
    subMarka: String
    status: String!
    stockstatus: String
    uploadedAt: String
  }

  type LoadingItem {
    id: ID!
    receipt: String!
    container: String!
    containerNumber: String
    shippingLine: String
    quantity: String!
    originalTotalQuantity: String
    isSplit: Boolean
    splitIndex: Int
    weight: String
    volume: String
    commodity: String
    english: String
    chinese: String
    warehouse: String
    date: String
    eta: String
    status: String
  }

  type LoadingPlan {
    id: ID!
    container: String!
    containerNumber: String
    shippingLine: String
    warehouse: String
    planStatus: String!
    isFinalized: Boolean!
    finalizedAt: String
    allottedActualAt: String
    eta: String
    destinationDate: String
    status: String
    totalQuantity: Int
    shipmentCount: Int
    items: [LoadingItem!]
  }

  type ContainerArrival {
    success: Boolean!
    container: String!
    eta: String
    status: String
    shippedFrom: String
    shippedTo: String
    currentLocation: String
    startDate: String
    destinationDate: String
    vesselName: String
    voyageNumber: String
    formattedArrivalMessage: String!
    daysRemaining: Int
    shipments: [Shipment!]
  }

  type ReceiptSearchResult {
    success: Boolean!
    count: Int!
    receipt: String!
    isSplit: Boolean
    warehouseReceipt: WarehouseReceipt
    shipments: [Shipment!]!
  }

  type ApiKeyStats {
    plan: String
    requests_total: Int
    requests_made: Int
    requests_available: Int
    error: String
  }

  type MutationResult {
    success: Boolean!
    message: String!
    count: Int
  }

  type Query {
    trackByReceipt(receipt: String!): ReceiptSearchResult!
    trackByContainer(container: String!): ContainerArrival!
    shipments(search: String): [Shipment!]!
    warehouseReceipts(warehouse: String, status: String, search: String): [WarehouseReceipt!]!
    warehouseReceipt(receipt: String!): WarehouseReceipt
    loadingPlans(status: String): [LoadingPlan!]!
    loadingPlan(container: String!): LoadingPlan
    apiKeyStats: ApiKeyStats!
  }

  type Mutation {
    createLoadingPlan(container: String!, warehouse: String, notes: String): MutationResult!
    splitAndLoadReceipt(receipt: String!, container: String!, quantityToLoad: Int!, weightToLoad: String, volumeToLoad: String): MutationResult!
    allotActualContainer(container: String!, containerNumber: String!, shippingLine: String!, autoSync: Boolean): MutationResult!
    finalizeLoadingPlan(container: String!, containerNumber: String, shippingLine: String): MutationResult!
    updateContainerMapping(container: String!, containerNumber: String!, shippingLine: String!): MutationResult!
    updateManualEta(container: String!, manualEta: String!, status: String, applyFilingBuffer: Boolean): MutationResult!
  }
`);

// GraphQL Root Resolvers
function createRootResolver(req: NextRequest) {
  return {
    // 1. Receipt Search Query (Pure Direct MongoDB Read - Zero JSONCargo API Calls)
    trackByReceipt: async ({ receipt }: { receipt: string }) => {
      const cleanQuery = receipt.trim();
      if (!cleanQuery) {
        throw new Error('Receipt parameter is required');
      }

      await connectToDatabase();
      
      // Fast exact index lookup first, fallback to regex
      let rawShipments: any[] = await Shipment.find({ receipt: cleanQuery }).sort({ uploadedAt: -1 }).lean();
      if (!rawShipments || rawShipments.length === 0) {
        const regex = new RegExp(`^${cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        rawShipments = await Shipment.find({ receipt: regex }).sort({ uploadedAt: -1 }).lean();
      }

      // Check if goods exist in China Warehouse Inward Stock
      const whItem: any = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();

      if ((!rawShipments || rawShipments.length === 0) && !whItem) {
        throw new Error(`No cargo record found for receipt number '${cleanQuery}'`);
      }

      const formattedWhReceipt = whItem
        ? {
            id: String(whItem._id),
            receipt: whItem.receipt,
            party: whItem.party || 'General Party',
            warehouse: whItem.warehouse,
            warehouseEntry: whItem.warehouseEntry || 'N/A',
            date: whItem.date || 'N/A',
            quantity: whItem.quantity || 0,
            loadedQuantity: whItem.loadedQuantity || 0,
            remainingQuantity:
              whItem.remainingQuantity !== undefined
                ? whItem.remainingQuantity
                : whItem.quantity - (whItem.loadedQuantity || 0),
            weight: whItem.weight || 'N/A',
            volume: whItem.volume || 'N/A',
            commodity: translateToEnglish(whItem.commodity || whItem.chinese || whItem.english),
            chinese: translateToEnglish(whItem.chinese || whItem.commodity || whItem.english),
            english: translateToEnglish(whItem.english || whItem.commodity || whItem.chinese),
            packaging: whItem.packaging || 'N/A',
            mainMarka: whItem.mainMarka || '',
            subMarka: whItem.subMarka || '',
            status: whItem.status || 'Received',
            stockstatus: whItem.stockstatus || 'In Stock',
            uploadedAt: whItem.uploadedAt ? new Date(whItem.uploadedAt).toISOString() : null,
          }
        : null;

      // If goods are received in China warehouse but not yet allocated into any container
      if (!rawShipments || rawShipments.length === 0) {
        return {
          success: true,
          count: 0,
          receipt: cleanQuery,
          isSplit: false,
          warehouseReceipt: formattedWhReceipt,
          shipments: [],
        };
      }

      // Collect all container aliases to resolve confirmed ETA from Container fleet
      const containerAliases = Array.from(new Set(rawShipments.map((s) => s.container).filter(Boolean)));
      const containerDocs: any[] = await Container.find({
        $or: containerAliases.map((c) => ({
          container: new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-_\\s]?')}$`, 'i'),
        })),
      }).lean();

      const containerEtaMap = new Map<string, string>();
      containerDocs.forEach((c: any) => {
        const eta = c.destinationDate && c.destinationDate !== 'N/A' ? c.destinationDate : c.eta;
        if (eta && eta !== 'N/A' && eta !== 'Pending') {
          containerEtaMap.set(c.container.toLowerCase().trim(), eta);
        }
      });

      // Strict Data Masking: Omit containerNumber; Translate Chinese Commodity to English ONLY
      const publicCargo = rawShipments.map((s) => {
        const cClean = (s.container || '').toLowerCase().trim();
        const directEta = containerEtaMap.get(cClean);
        const fallbackDoc = containerDocs.find(
          (cd: any) => cd.container.toLowerCase().replace(/[-\s]/g, '') === cClean.replace(/[-\s]/g, '')
        );
        const containerEta = directEta || fallbackDoc?.destinationDate || fallbackDoc?.eta || '';

        const resolvedEta =
          s.eta && s.eta !== 'N/A' && s.eta !== 'Pending'
            ? s.eta
            : containerEta || s.eta || 'Pending';

        // Async backfill if shipment was missing ETA
        if ((!s.eta || s.eta === 'N/A' || s.eta === 'Pending') && resolvedEta && resolvedEta !== 'Pending') {
          Shipment.updateOne({ _id: s._id }, { $set: { eta: resolvedEta } }).exec().catch(() => {});
        }

        // Format CBM preserving decimals
        let formattedVolume = s.volume || 'N/A';
        if (formattedVolume !== 'N/A') {
          const cleanVol = String(formattedVolume).replace(/cbm|m3/gi, '').trim();
          const n = parseFloat(cleanVol);
          if (!isNaN(n)) {
            formattedVolume = cleanVol.includes('.') ? cleanVol : n.toFixed(2);
          }
        }

        const publicDeliveryDate = calculatePublicDeliveryDate(resolvedEta);

        return {
          id: String(s._id),
          receipt: s.receipt,
          party: s.party || whItem?.party || 'General Party',
          container: s.container,
          containerNumber: null, // Strictly masked
          shippingLine: null,
          eta: publicDeliveryDate,
          dateOfDelivery: publicDeliveryDate,
          status: s.status || 'In Transit',
          lastApiSync: s.lastApiSync ? new Date(s.lastApiSync).toISOString() : null,
          warehouseEntry: s.warehouseEntry || 'N/A',
          commodity: translateToEnglish(s.commodity || s.chinese || s.english),
          chinese: translateToEnglish(s.chinese || s.commodity || s.english), // Enforce English translation ONLY
          english: translateToEnglish(s.english || s.commodity || s.chinese),
          quantity: s.quantity || '0',
          weight: s.weight || 'N/A',
          volume: formattedVolume,
          stockstatus: s.stockstatus || 'N/A',
          warehouse: s.warehouse || 'N/A',
          packaging: s.packaging || 'N/A',
          subMarka: s.subMarka || '',
          mainMarka: s.mainMarka || '',
          date: s.date || 'N/A',
          isSplit: Boolean(s.isSplit || rawShipments.length > 1),
          splitIndex: s.splitIndex || 1,
          originalTotalQuantity: s.originalTotalQuantity || s.quantity || '0',
          uploadedAt: s.uploadedAt ? new Date(s.uploadedAt).toISOString() : null,
        };
      });

      return {
        success: true,
        count: publicCargo.length,
        receipt: cleanQuery,
        isSplit: publicCargo.length > 1 || rawShipments.some((s) => s.isSplit),
        warehouseReceipt: formattedWhReceipt,
        shipments: publicCargo,
      };
    },

    // 2. Container Alias Search Query (Pure Direct MongoDB Read - Zero JSONCargo API Calls)
    trackByContainer: async ({ container }: { container: string }) => {
      const cleanQuery = container.trim();
      if (!cleanQuery) {
        throw new Error('Container parameter is required');
      }

      await connectToDatabase();

      const cleanEscaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const normalizedRegex = new RegExp(`^${cleanEscaped.replace(/[-\s]/g, '[-_\\s]?')}$`, 'i');

      const alphaNumericMatch = cleanQuery.match(/^([a-zA-Z]+)[-_\s]*0*(\d+)$/i);
      let zeroPaddedRegex: RegExp | null = null;
      if (alphaNumericMatch) {
        const prefix = alphaNumericMatch[1];
        const num = alphaNumericMatch[2];
        zeroPaddedRegex = new RegExp(`^${prefix}[-_\\s]*0*${num}$`, 'i');
      }

      const orConditions: any[] = [
        { container: cleanQuery },
        { container: normalizedRegex },
      ];
      if (zeroPaddedRegex) {
        orConditions.push({ container: zeroPaddedRegex });
      }
      orConditions.push({ containerNumber: new RegExp(`^${cleanEscaped}$`, 'i') });

      // 1. Check Container fleet model first
      const foundContainer: any = await Container.findOne({ $or: orConditions }).lean();

      let containerAlias = '';
      let etaStr = 'Pending';

      if (foundContainer) {
        containerAlias = foundContainer.container;
        etaStr = foundContainer.destinationDate || foundContainer.eta || 'Pending';
      } else {
        // 2. Fallback to Shipment records
        const rawContainerShipments: any[] = await Shipment.find({ $or: orConditions }).sort({ uploadedAt: -1 }).lean();
        if (rawContainerShipments && rawContainerShipments.length > 0) {
          containerAlias = rawContainerShipments[0].container;
          etaStr = rawContainerShipments[0].eta || 'Pending';
        }
      }

      if (!containerAlias) {
        throw new Error(`No container found matching '${cleanQuery}'. Please check the container number and try again.`);
      }

      // STRICT PRIVACY: Return ONLY container alias and ETA date.
      return {
        success: true,
        container: containerAlias,
        eta: etaStr || 'Pending',
        status: 'Scheduled',
        shippedFrom: null,
        shippedTo: null,
        currentLocation: null,
        startDate: null,
        destinationDate: null,
        vesselName: null,
        voyageNumber: null,
        formattedArrivalMessage: null,
        daysRemaining: null,
        shipments: [],
      };
    },

    // 3. Admin Search-First Shipments Query
    shipments: async ({ search }: { search?: string }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanSearch = search?.trim();
      if (!cleanSearch) {
        return [];
      }

      await connectToDatabase();
      const regex = new RegExp(cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const results = await Shipment.find({
        $or: [
          { receipt: regex },
          { container: regex },
          { containerNumber: regex },
          { warehouseEntry: regex },
        ],
      }).sort({ uploadedAt: -1 }).limit(200).lean();

      return results.map((s: any) => ({
        id: String(s._id),
        receipt: s.receipt,
        container: s.container,
        containerNumber: s.containerNumber,
        shippingLine: s.shippingLine,
        eta: s.eta,
        status: s.status,
        lastApiSync: s.lastApiSync ? new Date(s.lastApiSync).toISOString() : null,
        warehouseEntry: s.warehouseEntry,
        commodity: s.commodity,
        quantity: s.quantity,
        weight: s.weight,
        volume: s.volume,
        english: s.english,
        stockstatus: s.stockstatus,
        warehouse: s.warehouse,
        packaging: s.packaging,
        subMarka: s.subMarka,
        mainMarka: s.mainMarka,
        date: s.date,
        uploadedAt: s.uploadedAt ? new Date(s.uploadedAt).toISOString() : null,
      }));
    },

    // 4. API Key Usage Stats Query
    apiKeyStats: async () => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }
      return await fetchApiKeyStats();
    },

    // 4a. Warehouse Inward Receipts Query
    warehouseReceipts: async ({
      warehouse,
      status,
      search,
    }: {
      warehouse?: string;
      status?: string;
      search?: string;
    }) => {
      await connectToDatabase();
      const query: any = {};
      if (warehouse && warehouse !== 'ALL') {
        query.warehouse = new RegExp(`^${warehouse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      }
      if (status && status !== 'all') {
        query.status = status;
      }
      if (search) {
        const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ receipt: regex }, { commodity: regex }, { warehouse: regex }, { mainMarka: regex }];
      }
      const list: any[] = await WarehouseReceipt.find(query).sort({ uploadedAt: -1 }).limit(500).lean();
      return list.map((w: any) => ({
        id: String(w._id),
        receipt: w.receipt,
        warehouse: w.warehouse,
        warehouseEntry: w.warehouseEntry || 'N/A',
        date: w.date || 'N/A',
        quantity: w.quantity || 0,
        loadedQuantity: w.loadedQuantity || 0,
        remainingQuantity:
          w.remainingQuantity !== undefined ? w.remainingQuantity : (w.quantity || 0) - (w.loadedQuantity || 0),
        weight: w.weight || 'N/A',
        volume: w.volume || 'N/A',
        commodity: w.commodity || 'N/A',
        chinese: w.chinese || w.commodity || '',
        english: w.english || w.commodity || '',
        packaging: w.packaging || 'N/A',
        mainMarka: w.mainMarka || '',
        subMarka: w.subMarka || '',
        status: w.status || 'Received',
        stockstatus: w.stockstatus || 'In Stock',
        uploadedAt: w.uploadedAt ? new Date(w.uploadedAt).toISOString() : null,
      }));
    },

    // 4b. Single Warehouse Receipt Query
    warehouseReceipt: async ({ receipt }: { receipt: string }) => {
      await connectToDatabase();
      const w: any = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${receipt.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();
      if (!w) return null;
      return {
        id: String(w._id),
        receipt: w.receipt,
        warehouse: w.warehouse,
        warehouseEntry: w.warehouseEntry || 'N/A',
        date: w.date || 'N/A',
        quantity: w.quantity || 0,
        loadedQuantity: w.loadedQuantity || 0,
        remainingQuantity:
          w.remainingQuantity !== undefined ? w.remainingQuantity : (w.quantity || 0) - (w.loadedQuantity || 0),
        weight: w.weight || 'N/A',
        volume: w.volume || 'N/A',
        commodity: w.commodity || 'N/A',
        chinese: w.chinese || w.commodity || '',
        english: w.english || w.commodity || '',
        packaging: w.packaging || 'N/A',
        mainMarka: w.mainMarka || '',
        subMarka: w.subMarka || '',
        status: w.status || 'Received',
        stockstatus: w.stockstatus || 'In Stock',
        uploadedAt: w.uploadedAt ? new Date(w.uploadedAt).toISOString() : null,
      };
    },

    // 4c. Loading Plans Query
    loadingPlans: async ({ status }: { status?: string }) => {
      await connectToDatabase();
      const query: any = {};
      if (status) query.planStatus = status;

      const containers: any[] = await Container.find(query).sort({ updatedAt: -1 }).lean();
      const cAliases = containers.map((c) => c.container);
      const shipments: any[] = await Shipment.find({ container: { $in: cAliases } })
        .sort({ createdAt: -1 })
        .lean();

      const map = new Map<string, any[]>();
      shipments.forEach((s) => {
        const key = (s.container || '').toUpperCase().trim();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      });

      return containers.map((c) => {
        const key = (c.container || '').toUpperCase().trim();
        const items = map.get(key) || [];
        let totalQ = 0;
        items.forEach((i) => {
          const q = parseInt(String(i.quantity || 0), 10);
          if (!isNaN(q)) totalQ += q;
        });

        return {
          id: String(c._id),
          container: c.container,
          containerNumber: c.containerNumber || '',
          shippingLine: c.shippingLine || 'MSC',
          warehouse: c.warehouse || 'China Warehouse',
          planStatus: c.planStatus || (c.containerNumber ? 'Finalized' : 'Planning'),
          isFinalized: Boolean(c.isFinalized || (c.containerNumber && c.containerNumber.trim().length > 0)),
          finalizedAt: c.finalizedAt ? new Date(c.finalizedAt).toISOString() : null,
          allottedActualAt: c.allottedActualAt ? new Date(c.allottedActualAt).toISOString() : null,
          eta: c.destinationDate || c.eta || 'Pending',
          destinationDate: c.destinationDate || c.eta || 'N/A',
          status: c.status || 'Pending',
          totalQuantity: totalQ || c.totalQuantity || 0,
          shipmentCount: items.length,
          items: items.map((i: any) => ({
            id: String(i._id),
            receipt: i.receipt,
            container: i.container,
            containerNumber: i.containerNumber,
            shippingLine: i.shippingLine,
            quantity: String(i.quantity || 0),
            originalTotalQuantity: i.originalTotalQuantity ? String(i.originalTotalQuantity) : String(i.quantity || 0),
            isSplit: Boolean(i.isSplit),
            splitIndex: i.splitIndex || 1,
            weight: i.weight,
            volume: i.volume,
            commodity: i.commodity,
            english: i.english,
            chinese: i.chinese,
            warehouse: i.warehouse,
            date: i.date,
            eta: i.eta,
            status: i.status,
          })),
        };
      });
    },

    // 4d. Single Loading Plan Query
    loadingPlan: async ({ container }: { container: string }) => {
      await connectToDatabase();
      const cleanAlias = container.trim();
      const c: any = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).lean();
      if (!c) return null;

      const items: any[] = await Shipment.find({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      })
        .sort({ createdAt: -1 })
        .lean();

      let totalQ = 0;
      items.forEach((i) => {
        const q = parseInt(String(i.quantity || 0), 10);
        if (!isNaN(q)) totalQ += q;
      });

      return {
        id: String(c._id),
        container: c.container,
        containerNumber: c.containerNumber || '',
        shippingLine: c.shippingLine || 'MSC',
        warehouse: c.warehouse || 'China Warehouse',
        planStatus: c.planStatus || (c.containerNumber ? 'Finalized' : 'Planning'),
        isFinalized: Boolean(c.isFinalized || (c.containerNumber && c.containerNumber.trim().length > 0)),
        finalizedAt: c.finalizedAt ? new Date(c.finalizedAt).toISOString() : null,
        allottedActualAt: c.allottedActualAt ? new Date(c.allottedActualAt).toISOString() : null,
        eta: c.destinationDate || c.eta || 'Pending',
        destinationDate: c.destinationDate || c.eta || 'N/A',
        status: c.status || 'Pending',
        totalQuantity: totalQ || c.totalQuantity || 0,
        shipmentCount: items.length,
        items: items.map((i: any) => ({
          id: String(i._id),
          receipt: i.receipt,
          container: i.container,
          containerNumber: i.containerNumber,
          shippingLine: i.shippingLine,
          quantity: String(i.quantity || 0),
          originalTotalQuantity: i.originalTotalQuantity ? String(i.originalTotalQuantity) : String(i.quantity || 0),
          isSplit: Boolean(i.isSplit),
          splitIndex: i.splitIndex || 1,
          weight: i.weight,
          volume: i.volume,
          commodity: i.commodity,
          english: i.english,
          chinese: i.chinese,
          warehouse: i.warehouse,
          date: i.date,
          eta: i.eta,
          status: i.status,
        })),
      };
    },

    // 5. Admin 3-Column Container Mapping & Auto Sync Mutation
    updateContainerMapping: async ({
      container,
      containerNumber,
      shippingLine,
    }: {
      container: string;
      containerNumber: string;
      shippingLine: string;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanAlias = container.trim();
      const cleanNum = containerNumber.trim();
      const cleanCarrier = shippingLine.trim() || 'MSC';

      if (!cleanAlias || !cleanNum) {
        throw new Error('Container alias and actual container number are required');
      }

      await connectToDatabase();
      const escapedAlias = cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fuzzyPattern = escapedAlias.replace(/[-_\s]+/g, '[-_\\s]*');
      const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

      const tracking = await fetchContainerTracking(cleanNum, cleanCarrier);
      const now = new Date();

      const updateResult = await Shipment.updateMany(
        { container: regex },
        {
          $set: {
            containerNumber: cleanNum,
            shippingLine: cleanCarrier,
            eta: tracking.eta,
            status: tracking.status,
            shippedFrom: tracking.shippedFrom,
            shippedTo: tracking.shippedTo,
            currentLocation: tracking.currentLocation,
            startDate: tracking.startDate,
            destinationDate: tracking.destinationDate,
            vesselName: tracking.vesselName,
            voyageNumber: tracking.voyageNumber,
            jsonCargoData: tracking.dataDetails,
            lastApiSync: now,
          },
        }
      );

      // Also upsert into dedicated Container collection
      await Container.findOneAndUpdate(
        { container: cleanAlias },
        {
          $set: {
            container: cleanAlias,
            containerNumber: cleanNum,
            shippingLine: cleanCarrier,
            eta: tracking.eta,
            status: tracking.status,
            shippedFrom: tracking.shippedFrom,
            shippedTo: tracking.shippedTo,
            currentLocation: tracking.currentLocation,
            startDate: tracking.startDate,
            destinationDate: tracking.destinationDate,
            vesselName: tracking.vesselName,
            voyageNumber: tracking.voyageNumber,
            jsonCargoData: tracking.dataDetails,
            shipmentCount: updateResult.matchedCount,
            lastApiSync: now,
          },
        },
        { upsert: true, new: true }
      );

      return {
        success: true,
        message: `Successfully mapped '${cleanAlias}' -> '${cleanNum}' (${cleanCarrier}) and synced ETA '${tracking.eta}'`,
        count: updateResult.modifiedCount,
      };
    },

    // 6. Admin Manual ETA Date Setter Mutation
    updateManualEta: async ({
      container,
      manualEta,
      status,
      applyFilingBuffer,
    }: {
      container: string;
      manualEta: string;
      status?: string;
      applyFilingBuffer?: boolean;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanQuery = container.trim();
      const cleanEta = manualEta.trim();

      if (!cleanQuery || !cleanEta) {
        throw new Error('Container and manual ETA date are required');
      }

      await connectToDatabase();
      const escapedInput = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fuzzyPattern = escapedInput.replace(/[-_\s]+/g, '[-_\\s]*');
      const regex = new RegExp(`^${fuzzyPattern}$`, 'i');

      let finalEta = cleanEta;
      if (applyFilingBuffer) {
        finalEta = addFilingBufferDays(cleanEta, 7);
      }

      const finalStatus = (status || 'Manually Set').trim();
      const now = new Date();

      const updateResult = await Shipment.updateMany(
        { $or: [{ container: regex }, { containerNumber: regex }] },
        {
          $set: {
            eta: finalEta,
            destinationDate: finalEta,
            status: finalStatus,
            lastApiSync: now,
          },
        }
      );

      // Also persist to Container collection
      await Container.findOneAndUpdate(
        { $or: [{ container: regex }, { containerNumber: regex }] },
        {
          $set: {
            eta: finalEta,
            destinationDate: finalEta,
            status: finalStatus,
            lastApiSync: now,
          },
        }
      );

      return {
        success: true,
        message: `Set manual ETA to '${finalEta}' for ${updateResult.modifiedCount} receipt(s) under container '${cleanQuery}'`,
        count: updateResult.modifiedCount,
      };
    },

    // 7. Create Loading Plan (Internal Container) Mutation
    createLoadingPlan: async ({
      container,
      warehouse,
      notes,
    }: {
      container: string;
      warehouse?: string;
      notes?: string;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanAlias = container.trim().toUpperCase();
      if (!cleanAlias) {
        throw new Error('Container alias is required');
      }

      await connectToDatabase();
      const existing = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (existing) {
        throw new Error(`Loading plan / container '${cleanAlias}' already exists`);
      }

      const cleanWh = (warehouse || 'China Warehouse').trim();
      await Container.create({
        container: cleanAlias,
        planNumber: cleanAlias,
        containerNumber: '',
        shippingLine: 'MSC',
        warehouse: cleanWh,
        planStatus: 'Planning',
        isFinalized: false,
        shippedFrom: `${cleanWh}, China`,
        shippedTo: 'Nhava Sheva / Mundra, India',
        status: 'Planning',
        eta: 'Pending',
        destinationDate: 'N/A',
        totalQuantity: 0,
        shipmentCount: 0,
      });

      return {
        success: true,
        message: `Loading plan '${cleanAlias}' created successfully for ${cleanWh}`,
        count: 1,
      };
    },

    // 8. Split & Load Cargo Mutation
    splitAndLoadReceipt: async ({
      receipt,
      container,
      quantityToLoad,
      weightToLoad,
      volumeToLoad,
    }: {
      receipt: string;
      container: string;
      quantityToLoad: number;
      weightToLoad?: string;
      volumeToLoad?: string;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanReceipt = receipt.trim();
      const cleanContainer = container.trim();
      const qty = parseInt(String(quantityToLoad), 10);

      if (!cleanReceipt || !cleanContainer) {
        throw new Error('Receipt and Container alias are required');
      }
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantity to load must be greater than 0');
      }

      await connectToDatabase();

      const targetContainer = await Container.findOne({
        container: new RegExp(`^${cleanContainer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (!targetContainer) {
        throw new Error(`Container '${cleanContainer}' not found`);
      }

      let whReceipt = await WarehouseReceipt.findOne({
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      if (!whReceipt) {
        throw new Error(
          `Receipt '${cleanReceipt}' has not been received in China warehouse stock yet. Goods must be received first.`
        );
      }

      const available =
        whReceipt.remainingQuantity !== undefined
          ? whReceipt.remainingQuantity
          : whReceipt.quantity - (whReceipt.loadedQuantity || 0);

      if (qty > available) {
        throw new Error(
          `Cannot load ${qty} units. Only ${available} units remaining in warehouse for receipt '${cleanReceipt}' (Total received: ${whReceipt.quantity}, already loaded: ${whReceipt.loadedQuantity || 0})`
        );
      }

      const existingSplits = await Shipment.countDocuments({
        receipt: new RegExp(`^${cleanReceipt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });

      await Shipment.create({
        receipt: whReceipt.receipt,
        receiptId: whReceipt._id,
        container: targetContainer.container,
        containerNumber: targetContainer.containerNumber || '',
        shippingLine: targetContainer.shippingLine || 'MSC',
        quantity: String(qty),
        originalTotalQuantity: String(whReceipt.quantity),
        isSplit: qty < whReceipt.quantity || existingSplits > 0,
        splitIndex: existingSplits + 1,
        weight: weightToLoad || whReceipt.weight || '',
        volume: volumeToLoad || whReceipt.volume || '',
        commodity: whReceipt.commodity || '',
        chinese: whReceipt.chinese || '',
        english: whReceipt.english || '',
        packaging: whReceipt.packaging || '',
        mainMarka: whReceipt.mainMarka || '',
        subMarka: whReceipt.subMarka || '',
        warehouse: whReceipt.warehouse || targetContainer.warehouse || 'China Warehouse',
        warehouseEntry: whReceipt.warehouseEntry || '',
        date: whReceipt.date || '',
        eta: targetContainer.destinationDate || targetContainer.eta || 'Pending',
        status: targetContainer.status || 'Planning',
        uploadedAt: new Date(),
      });

      whReceipt.loadedQuantity = (whReceipt.loadedQuantity || 0) + qty;
      whReceipt.remainingQuantity = Math.max(0, whReceipt.quantity - whReceipt.loadedQuantity);
      if (whReceipt.remainingQuantity === 0) {
        whReceipt.status = 'Fully Loaded';
        whReceipt.stockstatus = 'Dispatched';
      } else {
        whReceipt.status = 'Partially Loaded';
        whReceipt.stockstatus = 'Partially Dispatched';
      }
      await whReceipt.save();

      targetContainer.shipmentCount = (targetContainer.shipmentCount || 0) + 1;
      targetContainer.totalQuantity = (targetContainer.totalQuantity || 0) + qty;
      await targetContainer.save();

      return {
        success: true,
        message: `Successfully loaded ${qty} units of '${whReceipt.receipt}' into ${targetContainer.container}`,
        count: qty,
      };
    },

    // 9. Allot Actual Carrier Container Mutation
    allotActualContainer: async ({
      container,
      containerNumber,
      shippingLine,
      autoSync,
    }: {
      container: string;
      containerNumber: string;
      shippingLine: string;
      autoSync?: boolean;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanAlias = container.trim();
      const cleanNum = containerNumber.trim();
      const cleanCarrier = (shippingLine || 'MSC').trim();

      if (!cleanAlias || !cleanNum) {
        throw new Error('Container alias and actual container number are required');
      }

      await connectToDatabase();

      const target = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (!target) {
        throw new Error(`Container '${cleanAlias}' not found`);
      }

      let trackingEta = target.eta || 'Pending';
      let trackingStatus = 'In Transit';
      let trackingDetails: any = null;

      if (autoSync) {
        try {
          const tracking = await fetchContainerTracking(cleanNum, cleanCarrier);
          if (tracking.eta && tracking.eta !== 'N/A') trackingEta = tracking.eta;
          if (tracking.status) trackingStatus = tracking.status;
          trackingDetails = tracking.dataDetails;
        } catch {
          // graceful fallback
        }
      }

      const now = new Date();
      target.containerNumber = cleanNum;
      target.shippingLine = cleanCarrier;
      target.planStatus = 'Finalized';
      target.isFinalized = true;
      target.allottedActualAt = now;
      target.status = trackingStatus;
      if (trackingEta && trackingEta !== 'Pending') {
        target.eta = trackingEta;
        target.destinationDate = trackingEta;
      }
      if (trackingDetails) {
        target.jsonCargoData = trackingDetails;
        target.lastApiSync = now;
      }
      await target.save();

      const res = await Shipment.updateMany(
        { container: target.container },
        {
          $set: {
            containerNumber: cleanNum,
            shippingLine: cleanCarrier,
            status: trackingStatus,
            ...(trackingEta && trackingEta !== 'Pending' ? { eta: trackingEta, destinationDate: trackingEta } : {}),
            ...(trackingDetails ? { jsonCargoData: trackingDetails, lastApiSync: now } : {}),
          },
        }
      );

      return {
        success: true,
        message: `Container '${cleanAlias}' finalized. Allotted actual container '${cleanNum}' (${cleanCarrier}) across ${res.modifiedCount} item(s)`,
        count: res.modifiedCount,
      };
    },

    // 10. Finalize Loading Plan Mutation
    finalizeLoadingPlan: async ({
      container,
      containerNumber,
      shippingLine,
    }: {
      container: string;
      containerNumber?: string;
      shippingLine?: string;
    }) => {
      if (!isAdminAuthenticated(req)) {
        throw new Error('Unauthorized');
      }

      const cleanAlias = container.trim();
      if (!cleanAlias) throw new Error('Container alias is required');

      await connectToDatabase();
      const target = await Container.findOne({
        container: new RegExp(`^${cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (!target) throw new Error(`Container '${cleanAlias}' not found`);

      target.isFinalized = true;
      target.finalizedAt = new Date();
      target.planStatus = 'Finalized';
      if (containerNumber) target.containerNumber = containerNumber.trim();
      if (shippingLine) target.shippingLine = shippingLine.trim();
      await target.save();

      if (containerNumber) {
        await Shipment.updateMany(
          { container: target.container },
          {
            $set: {
              containerNumber: containerNumber.trim(),
              shippingLine: (shippingLine || target.shippingLine || 'MSC').trim(),
            },
          }
        );
      }

      return {
        success: true,
        message: `Loading plan '${cleanAlias}' marked as Finalized`,
        count: target.shipmentCount || 0,
      };
    },
  };
}

// POST Handler: Execute GraphQL Queries & Mutations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, variables } = body;

    if (!query) {
      return NextResponse.json({ errors: [{ message: 'GraphQL query parameter is required' }] }, { status: 400 });
    }

    const isMutation = query.trim().startsWith('mutation');
    const cacheKey = JSON.stringify({ query: query.trim(), variables });
    const now = Date.now();

    // Check fast query cache for read queries
    if (!isMutation && gqlCacheMap.has(cacheKey)) {
      const cached = gqlCacheMap.get(cacheKey)!;
      if (now - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
      gqlCacheMap.delete(cacheKey);
    }

    const rootValue = createRootResolver(req);
    const result = await graphql({
      schema,
      source: query,
      rootValue,
      variableValues: variables,
    });

    if (isMutation) {
      gqlCacheMap.clear(); // Invalidate cache on mutations
    } else if (!result.errors) {
      gqlCacheMap.set(cacheKey, { timestamp: now, data: result });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { errors: [{ message: error?.message || 'GraphQL Execution Error' }] },
      { status: 500 }
    );
  }
}

// GET Handler: GraphiQL / Query Interface support
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({
      message: 'GraphQL API Server. Send a POST request with { query, variables } to execute queries.',
    });
  }

  try {
    const rootValue = createRootResolver(req);
    const result = await graphql({
      schema,
      source: query,
      rootValue,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ errors: [{ message: error?.message }] }, { status: 500 });
  }
}
