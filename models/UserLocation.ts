import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILocationBreadcrumb {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: Date;
}

export interface IUserLocation extends Document {
  username: string;
  name: string;
  role: string;
  vehicleNumber?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  googleMapsUrl: string;
  platform: string;
  isOnline: boolean;
  lastSeenAt: Date;
  history: ILocationBreadcrumb[];
  createdAt: Date;
  updatedAt: Date;
}

const LocationBreadcrumbSchema = new Schema<ILocationBreadcrumb>(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    speed: { type: Number, default: null },
    heading: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserLocationSchema = new Schema<IUserLocation>(
  {
    username: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    role: { type: String, default: 'Field' },
    vehicleNumber: { type: String, default: '' },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    speed: { type: Number, default: null },
    heading: { type: Number, default: null },
    googleMapsUrl: { type: String, default: '' },
    platform: { type: String, default: 'mobile' },
    isOnline: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    history: { type: [LocationBreadcrumbSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserLocationSchema.index({ lastSeenAt: -1 });
UserLocationSchema.index({ username: 1, lastSeenAt: -1 });

const UserLocation: Model<IUserLocation> =
  mongoose.models.UserLocation || mongoose.model<IUserLocation>('UserLocation', UserLocationSchema);

export default UserLocation;
