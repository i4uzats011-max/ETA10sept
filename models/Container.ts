import mongoose, { Schema, Document } from 'mongoose';

export interface IContainer extends Document {
  container: string;            // Public container alias (e.g. 'USI-01', 'USI-03') - User visible
  containerNumber: string;      // Actual carrier container number (e.g. 'MSCU1234567') - Admin-only/Masked
  shippingLine: string;         // Carrier code (e.g. 'MSC', 'MAERSK', 'COSCO')
  shippedFrom?: string;         // Start port / location (e.g. 'Ningbo / Shanghai, China')
  shippedTo?: string;           // Destination port / location (e.g. 'Nhava Sheva / Mundra, India')
  currentLocation?: string;     // Current location (e.g. 'Singapore Strait / In Transit')
  startDate?: string;           // Departure / Start date (ATD/ETD)
  destinationDate?: string;     // Final arrival ETA date (with +7d filing buffer)
  eta?: string;                 // Destination ETA
  status?: string;              // Cargo status from carrier API (e.g. 'In Transit', 'Arrived')
  vesselName?: string;          // Vessel name
  voyageNumber?: string;        // Voyage number
  lastApiSync?: Date | null;    // Timestamp of last JSONCargo API sync
  jsonCargoData?: Record<string, any>; // Full raw/structured payload from JSONCargo API
  deliveryDate?: string;        // Delivery date (when marked delivered by user/admin)
  daysToDeliver?: number | null; // Calculated turnaround days from loading/receipt to delivery
  isDelivered?: boolean;        // Whether container is delivered
  shipmentCount?: number;       // Number of shipments inside container
  // Loading Plan & Multi-Warehouse Workflow Fields
  planNumber?: string;          // Loading Plan identifier (defaults to container alias)
  warehouse?: string;           // China origin loading warehouse (e.g. 'Guangzhou', 'Yiwu')
  loadingDate?: string;         // Loading / departure date from warehouse
  planStatus?: 'Draft' | 'Planning' | 'Finalized' | 'In Transit' | 'Delivered'; // Loading plan status
  isFinalized?: boolean;        // Whether the loading plan has been finalized by loader
  finalizedAt?: Date | null;    // Timestamp when plan was finalized
  allottedActualAt?: Date | null; // Timestamp when actual container number was allotted
  totalQuantity?: number;       // Total packages / cartons planned inside
  totalWeight?: string;         // Aggregated weight
  totalVolume?: string;         // Aggregated volume (CBM)
  apiCalled?: boolean;          // Flag indicating whether ETA API was called for this container
  apiCallCount?: number;        // Number of times API was called
  apiCallHistory?: Array<{ timestamp: Date; source?: string; eta?: string; status?: string; rawSummary?: any }>; // Full API call audit log
  rawEta?: string;              // Carrier raw ETA before filing buffer
  etaBufferDays?: number;       // Clearance procedure buffer days added to raw ETA (default: 10)
  createdAt: Date;
  updatedAt: Date;
}

const ContainerSchema = new Schema<IContainer>(
  {
    container: { type: String, required: true, unique: true, index: true, trim: true },
    containerNumber: { type: String, default: '', index: true, trim: true },
    shippingLine: { type: String, default: 'Default', trim: true },
    shippedFrom: { type: String, default: 'China Port' },
    shippedTo: { type: String, default: 'India Port' },
    currentLocation: { type: String, default: 'In Transit' },
    startDate: { type: String, default: '' },
    destinationDate: { type: String, default: 'N/A' },
    eta: { type: String, default: 'N/A' },
    rawEta: { type: String, default: '' },
    etaBufferDays: { type: Number, default: 10 },
    status: { type: String, default: 'Pending' },
    deliveryDate: { type: String, default: '' },
    daysToDeliver: { type: Number, default: null },
    isDelivered: { type: Boolean, default: false, index: true },
    vesselName: { type: String, default: '' },
    voyageNumber: { type: String, default: '' },
    lastApiSync: { type: Date, default: null },
    jsonCargoData: { type: Schema.Types.Mixed, default: null },
    apiCalled: { type: Boolean, default: false, index: true },
    apiCallCount: { type: Number, default: 0 },
    apiCallHistory: { type: [Schema.Types.Mixed], default: [] },
    shipmentCount: { type: Number, default: 0 },
    planNumber: { type: String, default: '' },
    warehouse: { type: String, default: 'China Warehouse' },
    loadingDate: { type: String, default: '' },
    planStatus: {
      type: String,
      enum: ['Draft', 'Planning', 'Finalized', 'In Transit', 'Delivered'],
      default: 'Planning',
      index: true,
    },
    isFinalized: { type: Boolean, default: false, index: true },
    finalizedAt: { type: Date, default: null },
    allottedActualAt: { type: Date, default: null },
    totalQuantity: { type: Number, default: 0 },
    totalWeight: { type: String, default: '' },
    totalVolume: { type: String, default: '' },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Fast search indexes for public tracking, admin, and employee lookup
ContainerSchema.index({ containerNumber: 1, container: 1 });
ContainerSchema.index({ warehouse: 1, planStatus: 1 });
ContainerSchema.index({ status: 1, lastApiSync: 1 });

export default mongoose.models.Container || mongoose.model<IContainer>('Container', ContainerSchema);
