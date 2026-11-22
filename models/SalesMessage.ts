import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISalesMessage extends Document {
  receiptNo?: string;           // Optional link to specific Receipt No (e.g. '260528007')
  container?: string;           // Optional link to Container (e.g. 'USI-01')
  senderUsername: string;       // Sender user identifier
  senderName: string;           // Sender display name
  senderRole: 'sales_head' | 'sales_person' | 'admin' | 'staff' | 'developer';
  recipientUsername?: string;   // 'all' or specific salesperson username
  recipientRole?: string;
  message: string;              // Message content
  type: 'text' | 'rate_update' | 'hold' | 'available' | 'discrepancy';
  metadata?: Record<string, any>;
  isRead: boolean;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedAt?: Date | null;
  originalMessage?: string;
  isEdited?: boolean;
  editedBy?: string;
  editedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SalesMessageSchema = new Schema<ISalesMessage>(
  {
    receiptNo: { type: String, default: '', index: true, trim: true },
    container: { type: String, default: '', index: true, trim: true },
    senderUsername: { type: String, required: true, index: true, trim: true },
    senderName: { type: String, required: true, trim: true },
    senderRole: {
      type: String,
      enum: ['sales_head', 'sales_person', 'admin', 'staff', 'developer'],
      required: true,
      index: true,
    },
    recipientUsername: { type: String, default: 'all', index: true, trim: true },
    recipientRole: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'rate_update', 'hold', 'available', 'discrepancy'],
      default: 'text',
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: null },
    isRead: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    originalMessage: { type: String, default: '' },
    isEdited: { type: Boolean, default: false },
    editedBy: { type: String, default: '' },
    editedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

SalesMessageSchema.index({ receiptNo: 1, createdAt: 1 });
SalesMessageSchema.index({ recipientUsername: 1, createdAt: 1 });

const SalesMessage: Model<ISalesMessage> =
  mongoose.models.SalesMessage ||
  mongoose.model<ISalesMessage>('SalesMessage', SalesMessageSchema);

export default SalesMessage;
