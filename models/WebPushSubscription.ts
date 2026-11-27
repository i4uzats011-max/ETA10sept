import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebPushSubscription extends Document {
  token: string;              // Public tracking link token (e.g. trk_982ab1)
  endpoint: string;           // Push service endpoint URL (unique per device/browser)
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WebPushSubscriptionSchema = new Schema<IWebPushSubscription>(
  {
    token: { type: String, required: true, index: true, trim: true },
    endpoint: { type: String, required: true, unique: true, trim: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const WebPushSubscription: Model<IWebPushSubscription> =
  mongoose.models.WebPushSubscription ||
  mongoose.model<IWebPushSubscription>('WebPushSubscription', WebPushSubscriptionSchema);

export default WebPushSubscription;
