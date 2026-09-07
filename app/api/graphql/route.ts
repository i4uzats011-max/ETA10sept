import { NextRequest, NextResponse } from 'next/server';
import { buildSchema, graphql } from 'graphql';
import { connectToDatabase } from '@/lib/mongodb';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';
import { isAdminAuthenticated } from '@/lib/auth';
import { fetchContainerTracking, fetchApiKeyStats, addFilingBufferDays } from '@/lib/jsoncargo';
import { translateToEnglish } from '@/lib/translate';

export const dynamic = 'force-dynamic';

// In-Memory Fast Query Cache (60s TTL for ultra-fast GraphQL response)
const gqlCacheMap = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 60 * 1000;

// Define GraphQL Schema using Schema Definition Language (SDL)
const schema = buildSchema(`
  type Shipment {
    id: ID!
    receipt: String!
    container: String!
    containerNumber: String
    shippingLine: String
    eta: String
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
    uploadedAt: String
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
    apiKeyStats: ApiKeyStats!
  }

  type Mutation {
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

      if (!rawShipments || rawShipments.length === 0) {
        throw new Error(`No cargo record found for receipt number '${cleanQuery}'`);
      }

      // Strict Data Masking: Omit containerNumber; Translate Chinese Commodity to English ONLY
      const publicCargo = rawShipments.map((s) => ({
        id: String(s._id),
        receipt: s.receipt,
        container: s.container,
        containerNumber: null, // Strictly masked
        shippingLine: null,
        eta: s.eta || 'N/A',
        status: s.status || 'Pending',
        lastApiSync: s.lastApiSync ? new Date(s.lastApiSync).toISOString() : null,
        warehouseEntry: s.warehouseEntry || 'N/A',
        commodity: translateToEnglish(s.commodity || s.chinese || s.english),
        chinese: translateToEnglish(s.chinese || s.commodity || s.english), // Enforce English translation ONLY
        english: translateToEnglish(s.english || s.commodity || s.chinese),
        quantity: s.quantity || '0',
        weight: s.weight || 'N/A',
        volume: s.volume || 'N/A',
        stockstatus: s.stockstatus || 'N/A',
        warehouse: s.warehouse || 'N/A',
        packaging: s.packaging || 'N/A',
        subMarka: s.subMarka || '',
        mainMarka: s.mainMarka || '',
        date: s.date || 'N/A',
        uploadedAt: s.uploadedAt ? new Date(s.uploadedAt).toISOString() : null,
      }));

      return {
        success: true,
        count: publicCargo.length,
        receipt: cleanQuery,
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

      let rawContainerShipments: any[] = await Shipment.find({
        $or: [
          { container: cleanQuery },
          { container: normalizedRegex },
          { containerNumber: new RegExp(`^${cleanEscaped}$`, 'i') },
        ],
      }).sort({ uploadedAt: -1 }).lean();

      if (!rawContainerShipments || rawContainerShipments.length === 0) {
        throw new Error(`No container record found for '${cleanQuery}'`);
      }

      const primaryShipment = rawContainerShipments[0];
      const containerAlias = primaryShipment.container;
      const etaStr = primaryShipment.eta;
      let message = '';
      let daysRemaining: number | null = null;

      if (etaStr && etaStr !== 'N/A' && !isNaN(new Date(etaStr).getTime())) {
        const etaDate = new Date(etaStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = new Date(etaDate);
        targetDate.setHours(0, 0, 0, 0);

        const diffTime = targetDate.getTime() - today.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const dayName = etaDate.toLocaleDateString('en-US', { weekday: 'long' });
        const dd = String(etaDate.getDate()).padStart(2, '0');
        const mm = String(etaDate.getMonth() + 1).padStart(2, '0');
        const yy = String(etaDate.getFullYear()).slice(-2);
        const formattedDate = `${dd}/${mm}/${yy}`;

        if (daysRemaining > 0) {
          message = `${containerAlias} is arriving on ${dayName}, ${formattedDate} (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining from today).`;
        } else if (daysRemaining === 0) {
          message = `${containerAlias} is arriving today, ${dayName}, ${formattedDate}.`;
        } else {
          const absDays = Math.abs(daysRemaining);
          message = `${containerAlias} arrived on ${dayName}, ${formattedDate} (${absDays} ${absDays === 1 ? 'day' : 'days'} ago).`;
        }
      } else {
        message = `${containerAlias} ETA status is currently unconfirmed or pending.`;
      }

      // Format associated cargo shipments strictly in English ONLY
      const formattedCargo = rawContainerShipments.map((s) => ({
        id: String(s._id),
        receipt: s.receipt,
        container: s.container,
        containerNumber: null, // Strictly masked
        shippingLine: null,
        eta: s.eta || 'N/A',
        status: s.status || 'Pending',
        lastApiSync: s.lastApiSync ? new Date(s.lastApiSync).toISOString() : null,
        warehouseEntry: s.warehouseEntry || 'N/A',
        commodity: translateToEnglish(s.commodity || s.chinese || s.english),
        chinese: translateToEnglish(s.chinese || s.commodity || s.english),
        english: translateToEnglish(s.english || s.commodity || s.chinese),
        quantity: s.quantity || '0',
        weight: s.weight || 'N/A',
        volume: s.volume || 'N/A',
        stockstatus: s.stockstatus || 'N/A',
        warehouse: s.warehouse || 'N/A',
        packaging: s.packaging || 'N/A',
        subMarka: s.subMarka || '',
        mainMarka: s.mainMarka || '',
        date: s.date || 'N/A',
        uploadedAt: s.uploadedAt ? new Date(s.uploadedAt).toISOString() : null,
      }));

      return {
        success: true,
        container: containerAlias,
        eta: etaStr || 'N/A',
        status: primaryShipment.status || 'Pending',
        shippedFrom: primaryShipment.shippedFrom || 'Ningbo / Shanghai, China',
        shippedTo: primaryShipment.shippedTo || 'Nhava Sheva / Mundra, India',
        currentLocation: primaryShipment.currentLocation || primaryShipment.status || 'In Transit',
        startDate: primaryShipment.startDate || '',
        destinationDate: primaryShipment.destinationDate || etaStr || '',
        vesselName: primaryShipment.vesselName || '',
        voyageNumber: primaryShipment.voyageNumber || '',
        formattedArrivalMessage: message,
        daysRemaining,
        shipments: formattedCargo,
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
