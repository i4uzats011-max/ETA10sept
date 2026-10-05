import mongoose, { Schema, Document } from 'mongoose';

export interface IReceiptItem {
  _id?: any;
  itemName: string;            // Commodity / Item Name / Description
  chinese?: string;            // Chinese Commodity Name (中文品名)
  english?: string;            // Detailed item description in English
  quantity: number;            // Quantity / Cartons for this item
  packaging?: string;          // Packaging type (Carton, Box, etc.)
  weight?: string;             // Weight for this item
  volume?: string;             // Volume (CBM) for this item
  mainMarka?: string;          // Shipping mark
  subMarka?: string;
}

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
  items?: IReceiptItem[];       // Multiple line items / commodities with individual quantities
  status: 'Received in Warehouse' | 'Received' | 'Partially Loaded' | 'Fully Loaded' | 'Partially Delivered' | 'Delivered'; // Loading status: Received in Warehouse, Partially Loaded, Fully Loaded, Partially Delivered, Delivered
  stockstatus?: string;         // 'In Stock' | 'Partially Dispatched' | 'Dispatched' | 'Partially Delivered' | 'Delivered'
  deliveryDate?: string;        // Final delivery date
  isDelivered?: boolean;        // Delivery status
  notes?: string;               // Optional notes or remarks from warehouse
  phone?: string;               // Party contact / WhatsApp mobile
  partyPhone?: string;          // Party phone
  messageSent?: boolean;        // Arrival notification sent status
  messageSentAt?: Date | null;  // Timestamp of message sent
  messageSentDate?: string;     // Formatted message sent date/time
  uploadBatchId?: string;       // ID of upload batch for tracking & rollback
  uploadedAt: Date;             // Entry creation timestamp
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptItemSchema = new Schema(
  {
    itemName: { type: String, default: '', trim: true },
    chinese: { type: String, default: '', trim: true },
    english: { type: String, default: '', trim: true },
    quantity: { type: Number, default: 0 },
    packaging: { type: String, default: 'Carton', trim: true },
    weight: { type: String, default: '', trim: true },
    volume: { type: String, default: '', trim: true },
    mainMarka: { type: String, default: '', trim: true },
    subMarka: { type: String, default: '', trim: true },
  },
  { _id: true }
);

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
    items: { type: [ReceiptItemSchema], default: [] },
    status: {
      type: String,
      enum: ['Received in Warehouse', 'Received', 'Partially Loaded', 'Fully Loaded', 'Partially Delivered', 'Delivered'],
      default: 'Received in Warehouse',
      index: true,
    },
    stockstatus: { type: String, default: 'In Stock' },
    deliveryDate: { type: String, default: '' },
    isDelivered: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    phone: { type: String, default: '', trim: true },
    partyPhone: { type: String, default: '', trim: true },
    messageSent: { type: Boolean, default: false, index: true },
    messageSentAt: { type: Date, default: null },
    messageSentDate: { type: String, default: '' },
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

// Auto-calculate remainingQuantity, item totals, and status before save
WarehouseReceiptSchema.pre('save', function (next) {
  // If multiple items exist and have quantities, auto-calculate total quantity
  if (this.items && Array.isArray(this.items) && this.items.length > 0) {
    const calculatedQty = this.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (calculatedQty > 0) {
      this.quantity = calculatedQty;
    }
    // If commodity/english is empty, compose from items
    if (!this.commodity && !this.english) {
      const names = this.items.map((it) => it.itemName || it.english).filter(Boolean);
      this.commodity = names.join(', ');
      this.english = names.join(', ');
    }
  }

  if (this.quantity !== undefined && this.loadedQuantity !== undefined) {
    this.remainingQuantity = Math.max(0, this.quantity - this.loadedQuantity);

    // If remaining goods exist in warehouse stock, receipt CANNOT be fully delivered
    if (this.remainingQuantity > 0) {
      this.isDelivered = false;
      if (this.loadedQuantity <= 0) {
        this.status = 'Received in Warehouse';
        this.stockstatus = 'In Stock';
      } else if (this.status === 'Partially Delivered' || this.stockstatus === 'Partially Delivered') {
        this.status = 'Partially Delivered';
        this.stockstatus = 'Partially Delivered';
      } else {
        this.status = 'Partially Loaded';
        this.stockstatus = 'Partially Dispatched';
      }
    } else {
      // remainingQuantity === 0 (all received goods have been loaded)
      if (this.isDelivered) {
        this.status = 'Delivered';
        this.stockstatus = 'Delivered';
      } else if (this.status === 'Partially Delivered' || this.stockstatus === 'Partially Delivered') {
        this.status = 'Partially Delivered';
        this.stockstatus = 'Partially Delivered';
      } else if (this.loadedQuantity <= 0) {
        this.status = 'Received in Warehouse';
        this.stockstatus = 'In Stock';
      } else {
        this.status = 'Fully Loaded';
        this.stockstatus = 'Dispatched';
      }
    }
  }
  next();
});

export default mongoose.models.WarehouseReceipt || mongoose.model<IWarehouseReceipt>('WarehouseReceipt', WarehouseReceiptSchema);
