import mongoose, { Schema, Document } from 'mongoose';

export interface IBillItem {
  itemNo?: number;
  description: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface IBill extends Document {
  billNumber: string;           // Auto-generated Bill / Invoice Number
  receipt: string;              // Receipt / B/L Number (matches Shipment)
  hsnCode: string;              // Harmonized System of Nomenclature code
  igst: number;                 // IGST rate percentage (e.g. 18)
  quantityPcs: number;          // Cargo quantity in pieces
  quantityKg: number;           // Cargo quantity / weight in kg
  totalCartons?: number;        // Total packaging cartons in shipment
  dispatchedCartons?: number;    // Quantity in cartons dispatched by dispatcher
  remainingCartons?: number;     // Remaining cartons
  billingUnit?: 'Pcs' | 'KG' | 'Cartons'; // Decided by Biller: 'Pcs', 'KG', or 'Cartons'
  taxableValue: number;         // Taxable amount in INR
  igstAmount: number;           // IGST amount in INR (taxableValue * igst / 100)
  totalAmount: number;          // Grand total amount in INR (taxableValue + igstAmount)

  // Multiple items support
  items?: IBillItem[];

  // Linked cargo manifest details from Shipment
  container?: string;           // Container alias (e.g., 'USSI-139')
  containerNumber?: string;     // Physical container number
  party?: string;               // Shipper / Party / Client name
  mainMarka?: string;           // Main shipping mark
  subMarka?: string;            // Sub shipping mark
  commodity?: string;           // Goods description
  warehouse?: string;           // Origin warehouse (YW, GZ, etc.)
  loadingDate?: string;         // Loading / departure date
  eta?: string;                 // Cargo ETA

  // Seller / Billed-By Details (Selected by Biller)
  sellerId?: string;
  sellerName?: string;
  sellerGstin?: string;
  sellerAddress?: string;
  sellerCity?: string;
  sellerPincode?: string;
  sellerState?: string;
  sellerStateCode?: string;
  sellerPhone?: string;
  sellerEmail?: string;

  // Purchaser / Billed-To Details (Added by Biller - Registered or Unregistered)
  purchaserName?: string;
  purchaserRegistrationType?: 'Registered' | 'Unregistered';
  purchaserGstin?: string;
  purchaserAddress?: string;
  purchaserState?: string;
  purchaserStateCode?: string;

  // Consignee (Ship To) Details
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGstin?: string;
  consigneeState?: string;
  consigneeStateCode?: string;

  // Buyer (Bill To) Details
  buyerName?: string;
  buyerAddress?: string;
  buyerGstin?: string;
  buyerState?: string;
  buyerStateCode?: string;

  // Pricing
  rate?: number;

  // Dispatch Destination Address (Selected by Dispatcher from Marka addresses)
  deliveryAddressTitle?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;

  // Dispatcher & Vehicle Workflow Details
  vehicleNumber?: string;       // गाड़ी नंबर (e.g., 'HR 55 AB 1234')
  isDispatched: boolean;        // Whether the goods have been dispatched
  dispatchStatus: 'Pending Dispatch' | 'Dispatched' | 'Delivered';
  dispatchedAt?: Date | null;   // Precise timestamp when dispatcher marked as dispatched
  deliveryDate?: string;        // Delivery date (YYYY-MM-DD or DD/MM/YYYY)
  deliveryTime?: string;        // Delivery time string (e.g. '11:45 AM')
  dispatchedBy?: string;        // Name / ID of dispatcher
  dispatchRemarks?: string;     // Dispatch notes

  // Extra Invoice Metadata
  eWayBillNo?: string;
  deliveryNote?: string;
  modeOfPayment?: string;
  referenceNo?: string;
  otherReferences?: string;
  buyerOrderNo?: string;
  buyerOrderDate?: string;
  dispatchDocNo?: string;
  deliveryNoteDate?: string;
  destination?: string;
  termsOfDelivery?: string;

  createdAt: Date;
  updatedAt: Date;
}

const BillSchema = new Schema<IBill>(
  {
    billNumber: { type: String, required: true, unique: true, index: true, trim: true },
    receipt: { type: String, required: true, index: true, trim: true },
    hsnCode: { type: String, default: '', trim: true },
    igst: { type: Number, default: 18 },
    quantityPcs: { type: Number, default: 0 },
    quantityKg: { type: Number, default: 0 },
    totalCartons: { type: Number, default: 0 },
    dispatchedCartons: { type: Number, default: 0 },
    remainingCartons: { type: Number, default: 0 },
    billingUnit: {
      type: String,
      enum: ['Pcs', 'KG', 'Cartons'],
      default: 'Pcs',
    },
    taxableValue: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    container: { type: String, default: '', index: true, trim: true },
    containerNumber: { type: String, default: '', trim: true },
    party: { type: String, default: '', index: true, trim: true },
    mainMarka: { type: String, default: '', index: true, trim: true },
    subMarka: { type: String, default: '', index: true, trim: true },
    commodity: { type: String, default: '', trim: true },
    warehouse: { type: String, default: '', trim: true },
    loadingDate: { type: String, default: '' },
    eta: { type: String, default: '' },

    // Seller fields
    sellerId: { type: String, default: '' },
    sellerName: { type: String, default: '' },
    sellerGstin: { type: String, default: '' },
    sellerAddress: { type: String, default: '' },
    sellerCity: { type: String, default: '' },
    sellerPincode: { type: String, default: '' },
    sellerState: { type: String, default: '' },
    sellerStateCode: { type: String, default: '' },
    sellerPhone: { type: String, default: '' },
    sellerEmail: { type: String, default: '' },

    // Purchaser fields
    purchaserName: { type: String, default: '' },
    purchaserRegistrationType: { type: String, enum: ['Registered', 'Unregistered'], default: 'Registered' },
    purchaserGstin: { type: String, default: '' },
    purchaserAddress: { type: String, default: '' },
    purchaserState: { type: String, default: '' },
    purchaserStateCode: { type: String, default: '' },

    // Consignee (Ship to) fields
    consigneeName: { type: String, default: '' },
    consigneeAddress: { type: String, default: '' },
    consigneeGstin: { type: String, default: '' },
    consigneeState: { type: String, default: '' },
    consigneeStateCode: { type: String, default: '' },

    // Buyer (Bill to) fields
    buyerName: { type: String, default: '' },
    buyerAddress: { type: String, default: '' },
    buyerGstin: { type: String, default: '' },
    buyerState: { type: String, default: '' },
    buyerStateCode: { type: String, default: '' },

    // Pricing rate
    rate: { type: Number, default: 0 },

    // Destination address fields
    deliveryAddressTitle: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    deliveryPhone: { type: String, default: '' },

    vehicleNumber: { type: String, default: '', index: true, trim: true },
    isDispatched: { type: Boolean, default: false, index: true },
    dispatchStatus: {
      type: String,
      enum: ['Pending Dispatch', 'Dispatched', 'Delivered'],
      default: 'Pending Dispatch',
      index: true,
    },
    dispatchedAt: { type: Date, default: null },
    deliveryDate: { type: String, default: '' },
    deliveryTime: { type: String, default: '' },
    dispatchedBy: { type: String, default: '' },
    dispatchRemarks: { type: String, default: '' },

    // Multiple line items
    items: [
      {
        itemNo: { type: Number },
        description: { type: String, default: '', trim: true },
        hsnCode: { type: String, default: '', trim: true },
        quantity: { type: Number, default: 0 },
        unit: { type: String, default: 'PCS' },
        rate: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
    ],

    // Extra Invoice Metadata
    eWayBillNo: { type: String, default: '', trim: true },
    deliveryNote: { type: String, default: '', trim: true },
    modeOfPayment: { type: String, default: '', trim: true },
    referenceNo: { type: String, default: '', trim: true },
    otherReferences: { type: String, default: '', trim: true },
    buyerOrderNo: { type: String, default: '', trim: true },
    buyerOrderDate: { type: String, default: '', trim: true },
    dispatchDocNo: { type: String, default: '', trim: true },
    deliveryNoteDate: { type: String, default: '', trim: true },
    destination: { type: String, default: '', trim: true },
    termsOfDelivery: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Indexes for fast lookup by marka, container, and dispatch status
BillSchema.index({ mainMarka: 1, isDispatched: 1 });
BillSchema.index({ subMarka: 1, isDispatched: 1 });
BillSchema.index({ container: 1, isDispatched: 1 });

export default mongoose.models.Bill || mongoose.model<IBill>('Bill', BillSchema);
