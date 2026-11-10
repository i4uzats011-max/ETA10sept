import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReceiptEntry {
  id: string;
  receiptNo: string;
  warehouse?: string;          // Origin warehouse e.g. "GZ", "YW", "Guangzhou", "Yiwu"
  warehouseReceiptId?: string; // MongoDB _id of the exact WarehouseReceipt document
  marka?: string;              // Shipping Mark / Marka e.g. "VIP", "SHANTI"
  itemName?: string;
  cbm?: string;
  ctn?: string;
  weight?: string;
  containerNo?: string;        // Public display: Container No. (not actual)
  actualContainerNo?: string;  // Admin internal only
  eta?: string;                // YYYY-MM-DD
  deliveryDate?: string;       // Delivery date (when marked delivered)
  markedDate?: string;         // Marked date
  status?: string;             // Status: 'In Transit', 'Loaded', 'Customs Clearance', 'Arrived', 'Delivered', etc.
  adminNotes?: string;         // Admin internal only
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IReceiptTracking extends Document {
  token: string;               // Unique tracking token, e.g. trk_982ab1
  name?: string;               // Link Name / Allocated Party Name e.g. "Rahul Electronics"
  receipts: IReceiptEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    receiptNo: { type: String, required: true, trim: true },
    warehouse: { type: String, default: '', trim: true },
    warehouseReceiptId: { type: String, default: '', trim: true },
    marka: { type: String, default: '', trim: true },
    itemName: { type: String, default: '', trim: true },
    cbm: { type: String, default: '', trim: true },
    ctn: { type: String, default: '', trim: true },
    weight: { type: String, default: '', trim: true },
    containerNo: { type: String, default: '', trim: true }, // Container No. (not actual)
    actualContainerNo: { type: String, default: '', trim: true },
    eta: { type: String, default: '', trim: true },
    deliveryDate: { type: String, default: '', trim: true },
    markedDate: { type: String, default: '', trim: true },
    status: { type: String, default: 'In Transit', trim: true },
    adminNotes: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ReceiptTrackingSchema = new Schema<IReceiptTracking>(
  {
    token: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, default: '', trim: true, index: true },
    receipts: [ReceiptEntrySchema]
  },
  {
    timestamps: true
  }
);

const ReceiptTracking: Model<IReceiptTracking> =
  mongoose.models.ReceiptTracking ||
  mongoose.model<IReceiptTracking>('ReceiptTracking', ReceiptTrackingSchema);

export default ReceiptTracking;
