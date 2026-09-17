import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryAddress {
  _id?: any;
  title: string;             // Label e.g. 'Main Godown', 'Chandni Chowk Shop', 'Kundli Warehouse'
  address: string;           // Full physical address
  city?: string;             // City
  state?: string;            // State
  pincode?: string;          // Pincode
  contactPerson?: string;    // Person in charge
  phone?: string;            // Contact number
  isDefault: boolean;        // Whether this address is default
}

export interface IMarkaAddress extends Document {
  marka: string;             // Unique Marka (e.g. 'HA-AGG', 'FB', 'RLP')
  purchaserName: string;     // Purchaser / Consignee legal name
  registrationType: 'Registered' | 'Unregistered'; // Always known: Registered (with GSTIN) or Unregistered
  gstin?: string;            // GSTIN if registered
  pan?: string;              // PAN number
  state: string;             // State
  stateCode?: string;        // State code
  addresses: IDeliveryAddress[]; // Multiple delivery addresses for this Marka
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryAddressSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, default: 'Primary Godown' },
    address: { type: String, required: true, trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const MarkaAddressSchema = new Schema<IMarkaAddress>(
  {
    marka: { type: String, required: true, unique: true, index: true, trim: true },
    purchaserName: { type: String, required: true, trim: true, index: true },
    registrationType: {
      type: String,
      enum: ['Registered', 'Unregistered'],
      default: 'Registered',
    },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    pan: { type: String, default: '', trim: true, uppercase: true },
    state: { type: String, default: 'Delhi', trim: true },
    stateCode: { type: String, default: '07', trim: true },
    addresses: { type: [DeliveryAddressSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.MarkaAddress || mongoose.model<IMarkaAddress>('MarkaAddress', MarkaAddressSchema);
