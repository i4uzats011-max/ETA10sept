import mongoose, { Schema, Document } from 'mongoose';

export interface IShipment extends Document {
  // Identification & Search Fields
  receipt: string;              // Receipt/Bill number (Indexed for fast search)
  container: string;            // Public container alias e.g., 'USI 01', 'USI-1' (Indexed)
  containerNumber: string;      // Actual Shipping Container No e.g., 'MSCU1234567' (Admin-only, Indexed)
  shippingLine: string;         // Carrier code: MSCU, MAEU, CMAU, HLCU, COSU, ONEU, EMCU, YMLU (Default: 'Default')

  // Manifest & Warehouse Cargo Details
  stockstatus?: string;         // Stock status e.g., 'In Stock', 'Dispatched'
  warehouse?: string;           // Warehouse name/location
  date?: string;                // Cargo loading/entry date
  warehouseEntry?: string;      // Warehouse entry record number
  quantity?: string;            // Cargo piece/package count
  weight?: string;              // Total weight
  volume?: string;              // Total volume (CBM)
  commodity?: string;           // Commodity type
  chinese?: string;             // Chinese Commodity Name (中文品名)
  english?: string;             // Detailed item description in English
  packaging?: string;           // Packaging type (Box, Carton, Pallet, etc.)
  subMarka?: string;            // Sub-mark identifier
  mainMarka?: string;           // Main-mark identifier

  // Tracking & ETA Metadata
  eta?: string;                 // Final Destination ETA (Format: ISO string or YYYY-MM-DD)
  status?: string;              // Cargo status from carrier API (e.g., 'In Transit', 'Arrived')
  shippedFrom?: string;         // Start port / location (e.g., 'Ningbo / Shanghai, China')
  shippedTo?: string;           // Destination port / location (e.g., 'Nhava Sheva / Mundra, India')
  currentLocation?: string;     // Current / last known location (e.g., 'Singapore Strait / In Transit')
  startDate?: string;           // Departure / Start date (ATD/ETD)
  destinationDate?: string;     // Final Destination arrival date (ETA/ATA)
  vesselName?: string;          // Current Vessel name
  voyageNumber?: string;        // Current Voyage number
  jsonCargoData?: Record<string, any>; // Full JSONCargo tracking data payload
  lastApiSync?: Date | null;    // Timestamp of last JSONCargo API sync
  deliveryDate?: string;        // Delivery date (when marked delivered)
  daysToDeliver?: number | null; // Calculated turnaround days
  isDelivered?: boolean;        // Delivery flag
  // Multi-Warehouse & Split Cargo Workflow Fields
  party?: string;               // Party / customer / shipper name
  loadingDate?: string;         // Loading date into container
  receiptId?: any;              // Ref to WarehouseReceipt document
  originalTotalQuantity?: string; // Original total receipt quantity (e.g. '100')
  isSplit?: boolean;            // Whether this receipt was split into multiple containers
  splitIndex?: number;          // Split order index (e.g. 1, 2)
  apiCalled?: boolean;          // Whether API was invoked for this container/shipment
  apiCallCount?: number;        // Count of API calls made
  rawEta?: string;              // Carrier raw ETA
  uploadedAt: Date;             // Record creation timestamp
}

const ShipmentSchema = new Schema<IShipment>({
  receipt: { type: String, required: true, index: true, trim: true },
  container: { type: String, required: true, index: true, trim: true },
  containerNumber: { type: String, required: true, index: true, trim: true },
  shippingLine: { type: String, default: 'Default', trim: true },

  stockstatus: { type: String, default: '' },
  warehouse: { type: String, default: '' },
  date: { type: String, default: '' },
  warehouseEntry: { type: String, default: '' },
  quantity: { type: String, default: '' },
  weight: { type: String, default: '' },
  volume: { type: String, default: '' },
  commodity: { type: String, default: '' },
  chinese: { type: String, default: '' },
  english: { type: String, default: '' },
  packaging: { type: String, default: '' },
  subMarka: { type: String, default: '' },
  mainMarka: { type: String, default: '' },

  party: { type: String, default: '', index: true, trim: true },
  loadingDate: { type: String, default: '' },
  receiptId: { type: Schema.Types.ObjectId, ref: 'WarehouseReceipt', default: null },
  originalTotalQuantity: { type: String, default: '' },
  isSplit: { type: Boolean, default: false, index: true },
  splitIndex: { type: Number, default: 1 },

  eta: { type: String, default: 'N/A' },
  rawEta: { type: String, default: '' },
  status: { type: String, default: 'Pending' },
  deliveryDate: { type: String, default: '' },
  daysToDeliver: { type: Number, default: null },
  isDelivered: { type: Boolean, default: false },
  shippedFrom: { type: String, default: '' },
  shippedTo: { type: String, default: '' },
  currentLocation: { type: String, default: '' },
  startDate: { type: String, default: '' },
  destinationDate: { type: String, default: '' },
  vesselName: { type: String, default: '' },
  voyageNumber: { type: String, default: '' },
  jsonCargoData: { type: Schema.Types.Mixed, default: null },
  lastApiSync: { type: Date, default: null },
  apiCalled: { type: Boolean, default: false, index: true },
  apiCallCount: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  strict: false // Allows flexibility if extra legacy columns are present
});

// Fast compound search indexes for public, admin, and employee lookup
ShipmentSchema.index({ receipt: 1, container: 1 });
ShipmentSchema.index({ container: 1, containerNumber: 1 });
ShipmentSchema.index({ containerNumber: 1, receipt: 1 });
ShipmentSchema.index({ party: 1, receipt: 1 });
ShipmentSchema.index({ warehouse: 1 });

export default mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema);
