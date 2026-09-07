import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncError extends Document {
  container: string;            // Public container alias (e.g. 'USI-01')
  containerNumber: string;      // Actual carrier container number (e.g. 'MSCU1234567')
  shippingLine: string;         // Carrier code (e.g. 'MSC', 'MAERSK', 'COSCO')
  errorMessage: string;         // Reason for sync failure
  source: 'manual' | 'cron';    // Source of sync attempt ('manual' or 'cron')
  createdAt: Date;
  updatedAt: Date;
}

const SyncErrorSchema = new Schema<ISyncError>(
  {
    container: { type: String, default: '', index: true, trim: true },
    containerNumber: { type: String, required: true, index: true, trim: true },
    shippingLine: { type: String, default: 'Default', index: true, trim: true },
    errorMessage: { type: String, required: true },
    source: { type: String, enum: ['manual', 'cron'], default: 'manual' },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast aggregation of recent carrier outage alerts (within 7 days)
SyncErrorSchema.index({ shippingLine: 1, createdAt: -1 });
SyncErrorSchema.index({ createdAt: -1 });

export default mongoose.models.SyncError || mongoose.model<ISyncError>('SyncError', SyncErrorSchema);
