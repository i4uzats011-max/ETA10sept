import mongoose, { Schema, Document } from 'mongoose';

export type TransactionType = 'LEN_DEN' | 'EXPENSE' | 'INCOME';
export type TransactionSubType = 'GAVE' | 'GOT' | 'EXPENSE' | 'INCOME';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';

export interface IKhataTransaction extends Document {
  type: TransactionType;
  subType: TransactionSubType;
  contactId?: mongoose.Types.ObjectId;
  contactName?: string;
  amount: number;
  date: Date;
  dueDate?: Date | null;
  status: TransactionStatus;
  settledDate?: Date | null;
  category: string;
  paymentMode: PaymentMode;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const KhataTransactionSchema = new Schema<IKhataTransaction>(
  {
    type: {
      type: String,
      enum: ['LEN_DEN', 'EXPENSE', 'INCOME'],
      required: true,
      index: true,
    },
    subType: {
      type: String,
      enum: ['GAVE', 'GOT', 'EXPENSE', 'INCOME'],
      required: true,
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'KhataContact',
      index: true,
    },
    contactName: {
      type: String,
      default: '',
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'OVERDUE'],
      default: 'COMPLETED',
      index: true,
    },
    settledDate: {
      type: Date,
      default: null,
    },
    category: {
      type: String,
      default: 'General',
      trim: true,
    },
    paymentMode: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK', 'CHEQUE', 'OTHER'],
      default: 'CASH',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.KhataTransaction ||
  mongoose.model<IKhataTransaction>('KhataTransaction', KhataTransactionSchema);
