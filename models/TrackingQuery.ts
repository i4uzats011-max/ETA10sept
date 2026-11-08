import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITrackingQuery extends Document {
  token: string;
  receiptNo: string;
  marka?: string;
  senderName?: string;
  senderPhone?: string;
  message: string;
  reply?: string;
  status: 'Pending' | 'Answered' | 'Closed';
  createdAt: Date;
  updatedAt: Date;
}

const TrackingQuerySchema = new Schema<ITrackingQuery>(
  {
    token: { type: String, required: true, index: true, trim: true },
    receiptNo: { type: String, required: true, index: true, trim: true },
    marka: { type: String, default: '', trim: true },
    senderName: { type: String, default: '', trim: true },
    senderPhone: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    reply: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Pending', 'Answered', 'Closed'], default: 'Pending' }
  },
  {
    timestamps: true
  }
);

const TrackingQuery: Model<ITrackingQuery> =
  mongoose.models.TrackingQuery ||
  mongoose.model<ITrackingQuery>('TrackingQuery', TrackingQuerySchema);

export default TrackingQuery;
