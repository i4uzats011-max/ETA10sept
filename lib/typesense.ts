import { Client } from 'typesense';
import { connectToDatabase } from './mongodb';
import WarehouseReceipt from '@/models/WarehouseReceipt';
import Shipment from '@/models/Shipment';
import Container from '@/models/Container';

// Configuration
const TYPESENSE_HOST = process.env.TYPESENSE_HOST || 'localhost';
const TYPESENSE_PORT = parseInt(process.env.TYPESENSE_PORT || '8108', 10);
const TYPESENSE_PROTOCOL = (process.env.TYPESENSE_PROTOCOL || 'http') as 'http' | 'https';
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY || 'xyz';

// Lazy Singleton Client
let clientInstance: Client | null = null;
let isTypesenseHealthyCache: { healthy: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL_MS = 10000; // 10s health check cache

export function getTypesenseClient(): Client {
  if (!clientInstance) {
    clientInstance = new Client({
      nodes: [
        {
          host: TYPESENSE_HOST,
          port: TYPESENSE_PORT,
          protocol: TYPESENSE_PROTOCOL,
        },
      ],
      apiKey: TYPESENSE_API_KEY,
      connectionTimeoutSeconds: 1.5,
      numRetries: 1,
    });
  }
  return clientInstance;
}

export async function isTypesenseAvailable(): Promise<boolean> {
  const now = Date.now();
  if (isTypesenseHealthyCache && now - isTypesenseHealthyCache.checkedAt < HEALTH_CACHE_TTL_MS) {
    return isTypesenseHealthyCache.healthy;
  }

  try {
    const client = getTypesenseClient();
    const health = await client.health.retrieve();
    const isOk = Boolean(health?.ok);
    isTypesenseHealthyCache = { healthy: isOk, checkedAt: now };
    return isOk;
  } catch {
    isTypesenseHealthyCache = { healthy: false, checkedAt: now };
    return false;
  }
}

// Collection Schemas
export const WAREHOUSE_RECEIPTS_COLLECTION = 'warehouse_receipts';
export const SHIPMENTS_COLLECTION = 'shipments';
export const CONTAINERS_COLLECTION = 'containers';

export const warehouseReceiptsSchema = {
  name: WAREHOUSE_RECEIPTS_COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'receipt', type: 'string' as const, facet: true },
    { name: 'party', type: 'string' as const, facet: true, optional: true },
    { name: 'warehouse', type: 'string' as const, facet: true, optional: true },
    { name: 'commodity', type: 'string' as const, optional: true },
    { name: 'chinese', type: 'string' as const, optional: true },
    { name: 'english', type: 'string' as const, optional: true },
    { name: 'packaging', type: 'string' as const, optional: true },
    { name: 'mainMarka', type: 'string' as const, optional: true },
    { name: 'subMarka', type: 'string' as const, optional: true },
    { name: 'quantity', type: 'int32' as const, optional: true },
    { name: 'loadedQuantity', type: 'int32' as const, optional: true },
    { name: 'remainingQuantity', type: 'int32' as const, optional: true },
    { name: 'status', type: 'string' as const, facet: true, optional: true },
    { name: 'date', type: 'string' as const, optional: true },
  ],
  default_sorting_field: 'quantity',
};

export const shipmentsSchema = {
  name: SHIPMENTS_COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'receipt', type: 'string' as const, facet: true },
    { name: 'container', type: 'string' as const, facet: true },
    { name: 'containerNumber', type: 'string' as const, optional: true },
    { name: 'shippingLine', type: 'string' as const, optional: true },
    { name: 'party', type: 'string' as const, optional: true },
    { name: 'commodity', type: 'string' as const, optional: true },
    { name: 'english', type: 'string' as const, optional: true },
    { name: 'chinese', type: 'string' as const, optional: true },
    { name: 'packaging', type: 'string' as const, optional: true },
    { name: 'mainMarka', type: 'string' as const, optional: true },
    { name: 'subMarka', type: 'string' as const, optional: true },
    { name: 'quantity', type: 'int32' as const, optional: true },
    { name: 'warehouse', type: 'string' as const, optional: true },
    { name: 'status', type: 'string' as const, optional: true },
    { name: 'eta', type: 'string' as const, optional: true },
    { name: 'dateOfDelivery', type: 'string' as const, optional: true },
  ],
  default_sorting_field: 'quantity',
};

export const containersSchema = {
  name: CONTAINERS_COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'container', type: 'string' as const, facet: true },
    { name: 'containerNumber', type: 'string' as const, optional: true },
    { name: 'shippingLine', type: 'string' as const, optional: true },
    { name: 'shippedFrom', type: 'string' as const, optional: true },
    { name: 'shippedTo', type: 'string' as const, optional: true },
    { name: 'status', type: 'string' as const, optional: true },
    { name: 'eta', type: 'string' as const, optional: true },
    { name: 'deliveryDate', type: 'string' as const, optional: true },
  ],
};

/**
 * Ensure all collections exist in Typesense.
 */
export async function ensureCollections(): Promise<boolean> {
  const available = await isTypesenseAvailable();
  if (!available) return false;

  const client = getTypesenseClient();

  const schemas = [warehouseReceiptsSchema, shipmentsSchema, containersSchema];
  for (const schema of schemas) {
    try {
      await client.collections(schema.name).retrieve();
    } catch (err: any) {
      if (err.httpStatus === 404) {
        try {
          await client.collections().create(schema as any);
          console.log(`[Typesense] Created collection: ${schema.name}`);
        } catch (createErr) {
          console.error(`[Typesense] Failed to create collection ${schema.name}:`, createErr);
        }
      }
    }
  }
  return true;
}

/**
 * Transform a MongoDB WarehouseReceipt doc to a Typesense doc.
 */
function toTypesenseReceiptDoc(doc: any) {
  const qty = parseInt(String(doc.quantity || 0), 10) || 0;
  const loaded = parseInt(String(doc.loadedQuantity || 0), 10) || 0;
  const remaining = doc.remainingQuantity !== undefined
    ? parseInt(String(doc.remainingQuantity), 10) || 0
    : Math.max(0, qty - loaded);

  return {
    id: String(doc._id || doc.id),
    receipt: String(doc.receipt || '').trim(),
    party: String(doc.party || 'General Party').trim(),
    warehouse: String(doc.warehouse || 'Guangzhou Warehouse').trim(),
    commodity: String(doc.commodity || '').trim(),
    chinese: String(doc.chinese || '').trim(),
    english: String(doc.english || doc.commodity || '').trim(),
    packaging: String(doc.packaging || 'Carton').trim(),
    mainMarka: String(doc.mainMarka || '').trim(),
    subMarka: String(doc.subMarka || '').trim(),
    quantity: qty,
    loadedQuantity: loaded,
    remainingQuantity: remaining,
    status: String(doc.status || 'In Warehouse').trim(),
    date: String(doc.date || '').trim(),
  };
}

/**
 * Index a single Warehouse Receipt into Typesense.
 */
export async function indexSingleWarehouseReceipt(doc: any): Promise<void> {
  const available = await isTypesenseAvailable();
  if (!available) return;

  try {
    const client = getTypesenseClient();
    const docData = toTypesenseReceiptDoc(doc);
    await client
      .collections(WAREHOUSE_RECEIPTS_COLLECTION)
      .documents()
      .upsert(docData);
  } catch (err) {
    console.warn('[Typesense] Index single receipt error:', err);
  }
}

/**
 * Delete a single Warehouse Receipt from Typesense.
 */
export async function deleteSingleWarehouseReceipt(idOrReceipt: string): Promise<void> {
  const available = await isTypesenseAvailable();
  if (!available) return;

  try {
    const client = getTypesenseClient();
    await client
      .collections(WAREHOUSE_RECEIPTS_COLLECTION)
      .documents(idOrReceipt)
      .delete();
  } catch (err: any) {
    // If not found by ID, attempt search and delete
    try {
      const client = getTypesenseClient();
      await client
        .collections(WAREHOUSE_RECEIPTS_COLLECTION)
        .documents()
        .delete({ filter_by: `receipt:=${idOrReceipt}` });
    } catch {
      // ignore
    }
  }
}

/**
 * Re-index all MongoDB data into Typesense.
 */
export async function syncDatabaseToTypesense(): Promise<{
  success: boolean;
  receiptCount: number;
  shipmentCount: number;
  containerCount: number;
  message: string;
}> {
  await connectToDatabase();
  const available = await isTypesenseAvailable();

  if (!available) {
    return {
      success: false,
      receiptCount: 0,
      shipmentCount: 0,
      containerCount: 0,
      message: 'Typesense server is currently offline or unreachable at ' + TYPESENSE_HOST + ':' + TYPESENSE_PORT,
    };
  }

  await ensureCollections();
  const client = getTypesenseClient();

  // 1. Sync Warehouse Receipts
  const receipts = await WarehouseReceipt.find({}).lean();
  let receiptCount = 0;
  if (receipts.length > 0) {
    const docs = receipts.map(toTypesenseReceiptDoc);
    await client
      .collections(WAREHOUSE_RECEIPTS_COLLECTION)
      .documents()
      .import(docs, { action: 'upsert' });
    receiptCount = docs.length;
  }

  // 2. Sync Shipments
  const shipments = await Shipment.find({}).lean();
  let shipmentCount = 0;
  if (shipments.length > 0) {
    const docs = shipments.map((s: any) => ({
      id: String(s._id),
      receipt: String(s.receipt || '').trim(),
      container: String(s.container || '').trim(),
      containerNumber: String(s.containerNumber || '').trim(),
      shippingLine: String(s.shippingLine || '').trim(),
      party: String(s.party || '').trim(),
      commodity: String(s.commodity || '').trim(),
      english: String(s.english || '').trim(),
      chinese: String(s.chinese || '').trim(),
      packaging: String(s.packaging || '').trim(),
      mainMarka: String(s.mainMarka || '').trim(),
      subMarka: String(s.subMarka || '').trim(),
      quantity: parseInt(String(s.quantity || s.cartons || 0), 10) || 0,
      warehouse: String(s.warehouse || '').trim(),
      status: String(s.status || '').trim(),
      eta: String(s.eta || '').trim(),
      dateOfDelivery: String(s.dateOfDelivery || '').trim(),
    }));
    await client
      .collections(SHIPMENTS_COLLECTION)
      .documents()
      .import(docs, { action: 'upsert' });
    shipmentCount = docs.length;
  }

  // 3. Sync Containers
  const containers = await Container.find({}).lean();
  let containerCount = 0;
  if (containers.length > 0) {
    const docs = containers.map((c: any) => ({
      id: String(c._id),
      container: String(c.container || '').trim(),
      containerNumber: String(c.containerNumber || '').trim(),
      shippingLine: String(c.shippingLine || '').trim(),
      shippedFrom: String(c.shippedFrom || '').trim(),
      shippedTo: String(c.shippedTo || '').trim(),
      status: String(c.status || '').trim(),
      eta: String(c.eta || '').trim(),
      deliveryDate: String(c.deliveryDate || '').trim(),
    }));
    await client
      .collections(CONTAINERS_COLLECTION)
      .documents()
      .import(docs, { action: 'upsert' });
    containerCount = docs.length;
  }

  return {
    success: true,
    receiptCount,
    shipmentCount,
    containerCount,
    message: `Typesense sync complete: ${receiptCount} receipts, ${shipmentCount} shipments, ${containerCount} containers indexed.`,
  };
}

/**
 * Search Receipts using Typesense with typo-tolerance and fallback to MongoDB.
 */
export async function searchWarehouseReceiptsTypesense(
  query: string,
  limit: number = 20
): Promise<any[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const available = await isTypesenseAvailable();

  if (available) {
    try {
      const client = getTypesenseClient();
      const res = await client
        .collections(WAREHOUSE_RECEIPTS_COLLECTION)
        .documents()
        .search({
          q: trimmed,
          query_by: 'receipt,party,commodity,english,chinese,mainMarka,subMarka,warehouse',
          num_typos: 2,
          prefix: true,
          per_page: limit,
        });

      if (res.hits && res.hits.length > 0) {
        return res.hits.map((h: any) => h.document);
      }
    } catch (err) {
      console.warn('[Typesense] Search error, falling back to MongoDB:', err);
    }
  }

  // Resilient Fallback to MongoDB
  await connectToDatabase();
  const safeRegex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const docs = await WarehouseReceipt.find({
    $or: [
      { receipt: safeRegex },
      { party: safeRegex },
      { commodity: safeRegex },
      { english: safeRegex },
      { chinese: safeRegex },
      { mainMarka: safeRegex },
      { subMarka: safeRegex },
      { warehouse: safeRegex },
    ],
  })
    .limit(limit)
    .lean();

  return docs.map(toTypesenseReceiptDoc);
}

/**
 * Search Containers using Typesense with typo-tolerance and fallback to MongoDB.
 */
export async function searchContainersTypesense(
  query: string,
  limit: number = 15
): Promise<any[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const available = await isTypesenseAvailable();

  if (available) {
    try {
      const client = getTypesenseClient();
      const res = await client
        .collections(CONTAINERS_COLLECTION)
        .documents()
        .search({
          q: trimmed,
          query_by: 'container,containerNumber,shippingLine,shippedFrom,shippedTo',
          num_typos: 2,
          prefix: true,
          per_page: limit,
        });

      if (res.hits && res.hits.length > 0) {
        return res.hits.map((h: any) => h.document);
      }
    } catch (err) {
      console.warn('[Typesense] Container search error, falling back to MongoDB:', err);
    }
  }

  // Resilient Fallback to MongoDB
  await connectToDatabase();
  const safeRegex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const docs = await Container.find({
    $or: [
      { container: safeRegex },
      { containerNumber: safeRegex },
      { shippingLine: safeRegex },
    ],
  })
    .limit(limit)
    .lean();

  return docs.map((c: any) => ({
    id: String(c._id),
    container: c.container,
    containerNumber: c.containerNumber,
    shippingLine: c.shippingLine,
    status: c.status,
    eta: c.eta,
    deliveryDate: c.deliveryDate,
  }));
}

/**
 * Autocomplete suggestions for Public Tracking & Search.
 * NOTE: Receipt numbers are strictly CONFIDENTIAL documents and must NEVER be autocompleted
 * in public search to prevent exposing client shipment metadata to unauthenticated users.
 * Only public container aliases are suggested.
 */
export async function searchUnifiedSuggestions(query: string, limit: number = 8) {
  const trimmed = query.trim();
  if (!trimmed) return { suggestions: [] };

  // Only query containers for public autocomplete suggestions
  const containers = await searchContainersTypesense(trimmed, limit);

  const suggestions: Array<{
    type: 'container';
    id: string;
    title: string;
    subtitle: string;
    value: string;
  }> = [];

  // Add matching containers (alias only for public safety)
  for (const c of containers.slice(0, limit)) {
    suggestions.push({
      type: 'container',
      id: c.id || c.container,
      title: `Container ${c.container}`,
      subtitle: `Status: ${c.status || 'Active'}`,
      value: c.container,
    });
  }

  return { suggestions };
}
