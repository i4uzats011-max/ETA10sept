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

  eta: { type: String, default: 'N/A' },
  status: { type: String, default: 'Pending' },
  shippedFrom: { type: String, default: '' },
  shippedTo: { type: String, default: '' },
  currentLocation: { type: String, default: '' },
  startDate: { type: String, default: '' },
  destinationDate: { type: String, default: '' },
  vesselName: { type: String, default: '' },
  voyageNumber: { type: String, default: '' },
  jsonCargoData: { type: Schema.Types.Mixed, default: null },
  lastApiSync: { type: Date, default: null },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  strict: false // Allows flexibility if extra legacy columns are present
});

export default mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema);
