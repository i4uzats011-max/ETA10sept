import mongoose, { Schema, Document } from 'mongoose';

export interface IGoodsRateItem {
  _id?: any;
  name: string;                 // Item Name / Description (may be same or changed)
  rate?: number | string;       // Rate of goods
  rateUnit?: string;            // 'CTN' | 'CBM' | 'KG' | 'Fixed'
  ctn?: number;                 // Cartons count for this item
  cbm?: number | string;        // CBM volume
  weight?: number | string;     // Weight in KG
  cost?: number | string;       // Cost of item (rate fixed / calculated)
  remarks?: string;             // Item remarks / notes
}

export interface IShipment extends Document {
  // Identification & Search Fields
  receipt: string;              // Receipt/Bill number (Indexed for fast search)
  container: string;            // Public container alias e.g., 'USI 01', 'USI-1' (Indexed)
  containerNumber: string;      // Actual Shipping Container No e.g., 'MSCU1234567' (Admin-only, Indexed)
  blNumber?: string;            // Bill of Lading Number (B/L No.) - Common for one or more containers
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
  etaUpdatedAt?: Date | null;   // Timestamp of when ETA was last updated (manual or API)
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
  portDate?: string;            // Vessel arrival port date
  etaBufferDays?: number;       // Clearance procedure buffer days added to raw ETA (default: 7)
  lastModifiedBy?: string;      // Username of the user who last changed/updated data
  lastModifiedByRole?: string;  // Role of the user who last changed/updated data
  phone?: string;               // Party contact / WhatsApp mobile
  partyPhone?: string;          // Party phone
  plate?: string;               // Vehicle plate (e.g. 粤EDZ0505)
  delivery?: string;            // Delivery party / Driver (e.g. HUBERT, 货拉拉)
  type?: string;                // Cargo type (e.g. custom, battery, normal)
  rate?: string;                // Party freight/shipping rate (e.g. '23k', '500')
  'Overall / Receipt Freight Rate'?: string; // Exact DB field head for Overall / Receipt Freight Rate
  rateFixed?: boolean;          // Rate fixed flag
  totalCost?: number | string;  // Total cost of cargo items
  cost?: number | string;       // Cost alias
  remarks?: string;             // Remarks / Labeller goods notes
  containerRemarks?: Array<{ _id?: any; date: string; remarks: string; createdAt?: Date; createdBy?: string }>; // Container-wise status & remarks log
  isLabblerGoods?: boolean;     // Whether marked as labbler goods via remarks
  goodsItems?: IGoodsRateItem[];// Breakdown of one or more goods items on receipt
  // Sales Head & Sales Team Workflow Fields
  salesPerson?: string;         // Assigned sales executive name
  salesPersonUsername?: string; // Assigned sales executive username
  salesPersonUpdatedAt?: Date;  // Timestamp when salesperson assigned
  salesPersonUpdatedBy?: string;// User who assigned salesperson
  salesRate?: string;           // Rate entered/proposed by Sales Head
  salesRateUpdatedAt?: Date;    // Timestamp when rate updated
  salesRateUpdatedBy?: string;  // User who updated rate
  salesRemarks?: string;        // Remarks entered by Sales Head
  salesRemarksUpdatedAt?: Date; // Timestamp when remarks updated
  salesRemarksUpdatedBy?: string; // User who updated remarks
  salesStatus?: 'Normal' | 'Available to Deliver' | 'Hold'; // Normal, Available to Deliver, Hold
  holdReason?: string;          // Reason if put on Hold
  holdUpdatedAt?: Date;         // Timestamp when hold status changed
  holdUpdatedBy?: string;       // User who updated hold status
  goodsReceivedStatus?: 'full' | 'partial' | 'not_received'; // Full, Partial, Not Received by Party
  receivedQuantity?: number;    // Cartons received by party if partial
  goodsReceivedRemarks?: string;// Remarks on delivery/receipt
  goodsReceivedAt?: Date;       // Timestamp when goods receipt was marked
  goodsReceivedBy?: string;     // Dispatcher username who marked goods receipt
  unloadStatus?: 'fully_sent' | 'partly_sent' | 'not_in_container' | 'stored_in_warehouse';
  sentQuantity?: number;
  warehouseQuantity?: number;
  unloadRemarks?: string;
  unloadedAt?: Date;
  unloadedBy?: string;
  salesDiscrepancy?: {          // "Data Entry Wrong" discrepancy flagged by Sales Head/Person
    hasDiscrepancy: boolean;
    actualCbm?: string | number;
    actualWeight?: string | number;
    actualCtn?: number;
    remarks?: string;
    reportedBy?: string;
    reportedAt?: Date;
    status?: 'Pending' | 'Approved' | 'Rejected';
    adminNotes?: string;
    resolvedAt?: Date;
    resolvedBy?: string;
  };
  messageSent?: boolean;        // Arrival notification sent status
  messageSentAt?: Date | null;  // Timestamp of message sent
  messageSentDate?: string;     // Formatted message sent date/time
  uploadBatchId?: string;       // ID of upload batch for tracking & rollback
  uploadedAt: Date;             // Record creation timestamp
}

const ShipmentSchema = new Schema<IShipment>({
  receipt: { type: String, required: true, index: true, trim: true },
  container: { type: String, required: true, index: true, trim: true },
  containerNumber: { type: String, default: '', index: true, trim: true },
  blNumber: { type: String, default: '', index: true, trim: true },
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
  phone: { type: String, default: '', trim: true },
  partyPhone: { type: String, default: '', trim: true },
  plate: { type: String, default: '', trim: true },
  delivery: { type: String, default: '', trim: true },
  type: { type: String, default: '', trim: true },
  rate: { type: String, default: '', trim: true },
  'Overall / Receipt Freight Rate': { type: String, default: '', trim: true },
  rateFixed: { type: Boolean, default: false },
  totalCost: { type: Schema.Types.Mixed, default: '' },
  cost: { type: Schema.Types.Mixed, default: '' },
  remarks: { type: String, default: '', trim: true },
  isLabblerGoods: { type: Boolean, default: false },
  goodsItems: {
    type: [
      {
        name: { type: String, default: '', trim: true },
        rate: { type: Schema.Types.Mixed, default: '' },
        rateUnit: { type: String, default: 'CTN', trim: true },
        ctn: { type: Number, default: 0 },
        cbm: { type: Schema.Types.Mixed, default: '' },
        weight: { type: Schema.Types.Mixed, default: '' },
        cost: { type: Schema.Types.Mixed, default: '' },
        remarks: { type: String, default: '', trim: true },
      },
    ],
    default: [],
  },
  messageSent: { type: Boolean, default: false, index: true },
  messageSentAt: { type: Date, default: null },
  messageSentDate: { type: String, default: '' },
  loadingDate: { type: String, default: '' },
  receiptId: { type: Schema.Types.ObjectId, ref: 'WarehouseReceipt', default: null },
  originalTotalQuantity: { type: String, default: '' },
  isSplit: { type: Boolean, default: false, index: true },
  splitIndex: { type: Number, default: 1 },

  eta: { type: String, default: 'N/A' },
  rawEta: { type: String, default: '' },
  portDate: { type: String, default: '' },
  etaBufferDays: { type: Number, default: 7 },
  lastModifiedBy: { type: String, default: '', index: true, trim: true },
  lastModifiedByRole: { type: String, default: '', trim: true },
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
  salesPerson: { type: String, default: '', index: true, trim: true },
  salesPersonUsername: { type: String, default: '', index: true, trim: true },
  salesPersonUpdatedAt: { type: Date, default: null },
  salesPersonUpdatedBy: { type: String, default: '', trim: true },
  salesRate: { type: String, default: '', trim: true },
  salesRateUpdatedAt: { type: Date, default: null },
  salesRateUpdatedBy: { type: String, default: '', trim: true },
  salesRemarks: { type: String, default: '', trim: true },
  salesRemarksUpdatedAt: { type: Date, default: null },
  salesRemarksUpdatedBy: { type: String, default: '', trim: true },
  salesStatus: {
    type: String,
    enum: ['Normal', 'Available to Deliver', 'Hold'],
    default: 'Normal',
    index: true,
  },
  holdReason: { type: String, default: '', trim: true },
  holdUpdatedAt: { type: Date, default: null },
  holdUpdatedBy: { type: String, default: '', trim: true },
  salesDiscrepancy: { type: Schema.Types.Mixed, default: null },
  unloadStatus: {
    type: String,
    enum: ['fully_sent', 'partly_sent', 'not_in_container', 'stored_in_warehouse'],
    default: undefined,
    index: true,
  },
  sentQuantity: { type: Number, default: 0 },
  warehouseQuantity: { type: Number, default: 0 },
  unloadRemarks: { type: String, default: '', trim: true },
  unloadedAt: { type: Date, default: null },
  unloadedBy: { type: String, default: '', trim: true },
  lastApiSync: { type: Date, default: null },
  etaUpdatedAt: { type: Date, default: null },
  apiCalled: { type: Boolean, default: false, index: true },
  apiCallCount: { type: Number, default: 0 },
  uploadBatchId: { type: String, default: '', index: true },
  uploadedAt: { type: Date, default: Date.now },
  containerRemarks: {
    type: [
      {
        date: { type: String, required: true, trim: true },
        remarks: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: String, default: 'Admin' },
      },
    ],
    default: [],
  },
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
ShipmentSchema.index({ receipt: 1, warehouse: 1 });
ShipmentSchema.index({ receipt: 1, warehouse: 1, container: 1 });
ShipmentSchema.index({ receiptId: 1 });

export default mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema);
