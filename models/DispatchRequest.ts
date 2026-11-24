import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDispatchRequest extends Document {
  receipt: string;              // Receipt / B/L Number
  container: string;            // Container alias or number
  containerNumber?: string;     // Physical container number
  marka?: string;               // Marka
  party?: string;               // Party / Client name
  commodity?: string;           // Goods description
  vehicleNumber: string;        // Gaadi Number (e.g. DL-1AA-1234)
  cartonCount: number;          // CTN count to dispatch
  totalCartons?: number;        // Total receipt cartons
  place: string;                // Place / Delivery destination address
  status: 'Pending' | 'Billed' | 'Completed' | 'Cancelled';
  initiatedBy: string;          // Username of dispatcher
  initiatedByName?: string;     // Display name
  initiatedAt: Date;
  billerUsername?: string;      // Biller who processed the bill
  billId?: string;              // Linked Bill._id
  billNumber?: string;          // Generated bill / invoice number
  billedAt?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DispatchRequestSchema = new Schema<IDispatchRequest>(
  {
    receipt: { type: String, required: true, trim: true, index: true },
    container: { type: String, required: true, trim: true, index: true },
    containerNumber: { type: String, default: '', trim: true, index: true },
    marka: { type: String, default: '', trim: true, index: true },
    party: { type: String, default: '', trim: true },
    commodity: { type: String, default: '', trim: true },
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    cartonCount: { type: Number, required: true, min: 1 },
    totalCartons: { type: Number, default: 0 },
    place: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Billed', 'Completed', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    initiatedBy: { type: String, required: true, trim: true },
    initiatedByName: { type: String, default: '', trim: true },
    initiatedAt: { type: Date, default: Date.now },
    billerUsername: { type: String, default: '', trim: true },
    billId: { type: String, default: '', trim: true },
    billNumber: { type: String, default: '', trim: true },
    billedAt: { type: Date },
    remarks: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
  }
);

export default (mongoose.models.DispatchRequest as Model<IDispatchRequest>) ||
  mongoose.model<IDispatchRequest>('DispatchRequest', DispatchRequestSchema);
