import mongoose, { Schema, Document } from 'mongoose';

export type MismatchType =
  | 'QUANTITY_MISMATCH'
  | 'WEIGHT_MISMATCH'
  | 'VOLUME_MISMATCH'
  | 'COMMODITY_MISMATCH'
  | 'MARK_MISMATCH'
  | 'STOCK_STATE_MISMATCH'
  | 'RECEIVING_MISMATCH'
  | 'MISSING_IN_DB'
  | 'MISSING_IN_PORTAL';

export interface IChinaSyncMismatch extends Document {
  receipt: string;
  warehouse: 'GZ' | 'YW';
  mismatchType: MismatchType;
  diffSummary: string;
  dbData?: {
    quantity?: number;
    loadedQuantity?: number;
    remainingQuantity?: number;
    weight?: string;
    volume?: string;
    commodity?: string;
    chinese?: string;
    english?: string;
    mainMarka?: string;
    subMarka?: string;
    status?: string;
    stockstatus?: string;
    date?: string;
    isDelivered?: boolean;
  };
  portalData?: {
    actualQuantity?: number;
    weight?: string;
    volume?: string;
    commodity?: string;
    packaging?: string;
    mark?: string;
    stockState?: number;
    date?: string;
    customerName?: string;
    entryCode?: string;
    remark?: string;
  };
  auditPeriod: 'REALTIME' | 'DAILY_24H' | 'WEEKLY_7D' | 'MONTHLY_30D';
  status: 'PENDING' | 'RESOLVED' | 'IGNORED';
  resolutionAction?: 'ACCEPT_CHINA' | 'KEEP_DB' | 'MANUAL';
  detectedAt: Date;
  resolvedAt?: Date;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChinaSyncMismatchSchema = new Schema<IChinaSyncMismatch>(
  {
    receipt: { type: String, required: true, index: true, trim: true },
    warehouse: { type: String, required: true, enum: ['GZ', 'YW'], index: true },
    mismatchType: {
      type: String,
      required: true,
      enum: [
        'QUANTITY_MISMATCH',
        'WEIGHT_MISMATCH',
        'VOLUME_MISMATCH',
        'COMMODITY_MISMATCH',
        'MARK_MISMATCH',
        'STOCK_STATE_MISMATCH',
        'RECEIVING_MISMATCH',
        'MISSING_IN_DB',
        'MISSING_IN_PORTAL',
      ],
      index: true,
    },
    diffSummary: { type: String, required: true },
    dbData: { type: Schema.Types.Mixed, default: {} },
    portalData: { type: Schema.Types.Mixed, default: {} },
    auditPeriod: {
      type: String,
      enum: ['REALTIME', 'DAILY_24H', 'WEEKLY_7D', 'MONTHLY_30D'],
      default: 'REALTIME',
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'RESOLVED', 'IGNORED'],
      default: 'PENDING',
      index: true,
    },
    resolutionAction: {
      type: String,
      enum: ['ACCEPT_CHINA', 'KEEP_DB', 'MANUAL'],
      default: undefined,
    },
    detectedAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// Unique compound index so the same unresolved mismatch on a receipt is not duplicated
ChinaSyncMismatchSchema.index(
  { receipt: 1, warehouse: 1, mismatchType: 1, status: 1 },
  { name: 'uniq_active_mismatch' }
);

export default mongoose.models.ChinaSyncMismatch ||
  mongoose.model<IChinaSyncMismatch>('ChinaSyncMismatch', ChinaSyncMismatchSchema);
