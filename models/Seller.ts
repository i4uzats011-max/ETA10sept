import mongoose, { Schema, Document } from 'mongoose';

export interface ISeller extends Document {
  name: string;              // Legal / Trade Company Name
  gstin?: string;            // 15-digit GSTIN (e.g. 07AAAAA0000A1Z5)
  pan?: string;              // PAN number
  address: string;           // Street / building address
  city?: string;             // City
  state: string;             // State (e.g. Delhi, Maharashtra, Gujarat)
  stateCode?: string;        // 2-digit GST state code (e.g. '07', '27')
  pincode?: string;          // Pincode
  phone?: string;            // Contact phone
  email?: string;            // Contact email
  isDefault: boolean;        // Whether this is the default billing entity
  createdAt: Date;
  updatedAt: Date;
}

const SellerSchema = new Schema<ISeller>(
  {
    name: { type: String, required: true, trim: true, index: true },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    pan: { type: String, default: '', trim: true, uppercase: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: 'Delhi', trim: true },
    stateCode: { type: String, default: '07', trim: true },
    pincode: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Seller || mongoose.model<ISeller>('Seller', SellerSchema);
