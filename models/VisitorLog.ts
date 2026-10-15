import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVisitorLog extends Document {
  ip: string;
  visitorId: string;
  sessionCount: number;
  path: string;
  referrer: string;
  userAgent: string;

  // Geolocation Details
  country: string;
  countryCode: string;
  region: string;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  isp: string;
  org: string;
  timezone: string;

  // Device & Mobile Details
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  brand: string;
  model: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;

  // Client-side Hardware & Environment Metrics
  screenResolution: string;
  viewport: string;
  devicePixelRatio: number;
  orientation: string;
  touchSupport: boolean;
  maxTouchPoints: number;
  networkEffectiveType: string;
  language: string;

  createdAt: Date;
  updatedAt: Date;
}

const VisitorLogSchema: Schema = new Schema<IVisitorLog>(
  {
    ip: { type: String, required: true, index: true, trim: true },
    visitorId: { type: String, required: true, index: true, trim: true },
    sessionCount: { type: Number, default: 1 },
    path: { type: String, default: '/', trim: true, index: true },
    referrer: { type: String, default: 'Direct', trim: true },
    userAgent: { type: String, default: '', trim: true },

    // Geolocation
    country: { type: String, default: 'Unknown', index: true, trim: true },
    countryCode: { type: String, default: '', trim: true },
    region: { type: String, default: '', trim: true },
    city: { type: String, default: 'Unknown', index: true, trim: true },
    postal: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    isp: { type: String, default: '', trim: true },
    org: { type: String, default: '', trim: true },
    timezone: { type: String, default: '', trim: true },

    // Device & Mobile details
    deviceType: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop', 'bot', 'unknown'],
      default: 'unknown',
      index: true,
    },
    isMobile: { type: Boolean, default: false, index: true },
    isTablet: { type: Boolean, default: false },
    isDesktop: { type: Boolean, default: false },
    brand: { type: String, default: 'Unknown', index: true, trim: true },
    model: { type: String, default: 'Unknown', trim: true },
    os: { type: String, default: 'Unknown', index: true, trim: true },
    osVersion: { type: String, default: '', trim: true },
    browser: { type: String, default: 'Unknown', index: true, trim: true },
    browserVersion: { type: String, default: '', trim: true },

    // Client-side Metrics
    screenResolution: { type: String, default: '', trim: true },
    viewport: { type: String, default: '', trim: true },
    devicePixelRatio: { type: Number, default: 1 },
    orientation: { type: String, default: '', trim: true },
    touchSupport: { type: Boolean, default: false },
    maxTouchPoints: { type: Number, default: 0 },
    networkEffectiveType: { type: String, default: '', trim: true },
    language: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast querying and analytics
VisitorLogSchema.index({ createdAt: -1 });
VisitorLogSchema.index({ ip: 1, createdAt: -1 });
VisitorLogSchema.index({ visitorId: 1, createdAt: -1 });
VisitorLogSchema.index({ isMobile: 1, createdAt: -1 });
VisitorLogSchema.index({ country: 1, city: 1 });

const VisitorLog: Model<IVisitorLog> =
  mongoose.models.VisitorLog || mongoose.model<IVisitorLog>('VisitorLog', VisitorLogSchema);

export default VisitorLog;
