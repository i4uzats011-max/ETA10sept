import mongoose, { Schema } from 'mongoose';

export interface IApiUsageLog {
  _id?: any;
  apiName: 'gemini' | 'china_warehouse' | 'jsoncargo' | 'typesense' | string;
  action: string;
  endpoint?: string;
  model?: string;
  status: 'success' | 'error' | 'fallback_dict';
  itemCount: number;
  tokensPrompt?: number;
  tokensResponse?: number;
  tokensTotal?: number;
  latencyMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ApiUsageLogSchema = new Schema(
  {
    apiName: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    endpoint: { type: String, default: '' },
    model: { type: String, default: '' },
    status: { type: String, enum: ['success', 'error', 'fallback_dict'], default: 'success', index: true },
    itemCount: { type: Number, default: 1 },
    tokensPrompt: { type: Number, default: 0 },
    tokensResponse: { type: Number, default: 0 },
    tokensTotal: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    errorMessage: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

// Index for telemetry aggregation queries
ApiUsageLogSchema.index({ apiName: 1, createdAt: -1 });

export default mongoose.models.ApiUsageLog ||
  mongoose.model('ApiUsageLog', ApiUsageLogSchema);
