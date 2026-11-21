import mongoose, { Schema, Document } from 'mongoose';

export interface IKhataContact extends Document {
  name: string;
  phone?: string;
  email?: string;
  upiId?: string;
  address?: string;
  notes?: string;
  openingBalance: number; // positive = to receive (lena hai), negative = to pay (dena hai)
  currentBalance: number; // computed balance
  createdAt: Date;
  updatedAt: Date;
}

const KhataContactSchema = new Schema<IKhataContact>(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    upiId: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.KhataContact ||
  mongoose.model<IKhataContact>('KhataContact', KhataContactSchema);
