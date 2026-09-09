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
    status: { type: String, default: 'Pending' },
    deliveryDate: { type: String, default: '' },
    daysToDeliver: { type: Number, default: null },
    isDelivered: { type: Boolean, default: false, index: true },
    vesselName: { type: String, default: '' },
    voyageNumber: { type: String, default: '' },
    lastApiSync: { type: Date, default: null },
    jsonCargoData: { type: Schema.Types.Mixed, default: null },
    shipmentCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    strict: false,
  }
);

export default mongoose.models.Container || mongoose.model<IContainer>('Container', ContainerSchema);
