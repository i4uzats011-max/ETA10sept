import mongoose, { Schema, Document } from 'mongoose';

export interface IWarehouseReceipt extends Document {
  receipt: string;              // Unique Bill / Receipt number (Enforced unique index)
  party?: string;               // Shipper / Party / Client name
  warehouse: string;            // Origin China warehouse (e.g. 'Guangzhou', 'Yiwu', 'Ningbo', 'Shenzhen')
  warehouseEntry?: string;      // Entry record number
  date?: string;                // Date goods received from party
  quantity: number;             // Total received packages / cartons
  loadedQuantity: number;       // Cumulative quantity loaded across loading plans / containers
  remainingQuantity: number;    // Remaining stock in warehouse (quantity - loadedQuantity)
  weight?: string;              // Total weight
  volume?: string;              // Total volume (CBM)
  commodity?: string;           // Commodity type
  chinese?: string;             // Chinese Commodity Name (中文品名)
  english?: string;             // Detailed item description in English
  packaging?: string;           // Packaging type (Carton, Box, Pallet, etc.)
  mainMarka?: string;           // Main shipping mark
  subMarka?: string;            // Sub mark
  status: 'Received' | 'Partially Loaded' | 'Fully Loaded' | 'Delivered'; // Loading status
  stockstatus?: string;         // 'In Stock' | 'Partially Dispatched' | 'Dispatched' | 'Delivered'
  deliveryDate?: string;        // Final delivery date
  isDelivered?: boolean;        // Delivery status
  notes?: string;               // Optional notes or remarks from warehouse
  uploadBatchId?: string;       // ID of upload batch for tracking & rollback
  uploadedAt: Date;             // Entry creation timestamp
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseReceiptSchema = new Schema<IWarehouseReceipt>(
  {
    receipt: { type: String, required: true, index: true, trim: true },
    party: { type: String, default: '', index: true, trim: true },
    warehouse: { type: String, default: 'China Warehouse', index: true, trim: true },
    warehouseEntry: { type: String, default: '', trim: true },
    date: { type: String, default: '', required: true },
    quantity: { type: Number, default: 0 },
    loadedQuantity: { type: Number, default: 0 },
    remainingQuantity: { type: Number, default: 0 },
    weight: { type: String, default: '' },
    volume: { type: String, default: '' },
    commodity: { type: String, default: '' },
    chinese: { type: String, default: '' },
    english: { type: String, default: '' },
    packaging: { type: String, default: '' },
    mainMarka: { type: String, default: '' },
    subMarka: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Received', 'Partially Loaded', 'Fully Loaded', 'Delivered'],
      default: 'Received',
      index: true,
    },
    stockstatus: { type: String, default: 'In Stock' },
    deliveryDate: { type: String, default: '' },
    isDelivered: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    uploadBatchId: { type: String, default: '', index: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Enforce that receipt numbers are strictly unique warehouse-wise
WarehouseReceiptSchema.index({ receipt: 1, warehouse: 1 }, { unique: true });

// Fast search indexes for warehouse stock filtering and fast receipt search
WarehouseReceiptSchema.index({ warehouse: 1, status: 1 });

// Auto-calculate remainingQuantity and status before save
WarehouseReceiptSchema.pre('save', function (next) {
  if (this.quantity !== undefined && this.loadedQuantity !== undefined) {
    this.remainingQuantity = Math.max(0, this.quantity - this.loadedQuantity);
    if (this.loadedQuantity <= 0) {
      this.status = 'Received';
      this.stockstatus = 'In Stock';
    } else if (this.loadedQuantity >= this.quantity) {
      this.status = 'Fully Loaded';
      this.stockstatus = 'Dispatched';
    } else {
      this.status = 'Partially Loaded';
      this.stockstatus = 'Partially Dispatched';
    }
  }
  next();
});

export default mongoose.models.WarehouseReceipt || mongoose.model<IWarehouseReceipt>('WarehouseReceipt', WarehouseReceiptSchema);
