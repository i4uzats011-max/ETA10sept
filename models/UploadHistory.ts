import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadHistory extends Document {
  uploadId: string;               // Unique batch identifier e.g. 'UPL-17180...'
  fileName: string;               // Original uploaded file name
  uploadType: 'stock' | 'plan';   // 'stock' (China Warehouse Receipts) or 'plan' (Loading Plan Cargo)
  warehouse: string;              // Warehouse name
  targetContainer?: string;       // Target internal container number if loading plan
  totalRowsInFile: number;        // Total rows read from file
  savedCount: number;             // Count of unique records successfully saved
  duplicateCount: number;         // Count of duplicate receipts identified
  duplicates: Array<{ receipt: string; row?: number; reason: string }>; // List of duplicate details
  missingCount: number;           // Count of rows skipped due to missing mandatory fields
  missingDetails: Array<{ row: number; reason: string }>; // Details of skipped rows
  receipts: string[];             // Array of receipt numbers saved in this batch
  status: 'Active' | 'Deleted';   // Status of this upload batch
  deletedAt?: Date | null;        // Timestamp when this upload was deleted / rolled back
  deletedBy?: string;             // User who deleted this upload
  uploadedAt: Date;               // When upload took place
  createdAt: Date;
  updatedAt: Date;
}

const DuplicateItemSchema = new Schema(
  {
    receipt: { type: String, default: '' },
    row: { type: Number },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const MissingItemSchema = new Schema(
  {
    row: { type: Number, default: 0 },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const UploadHistorySchema = new Schema<IUploadHistory>(
  {
    uploadId: { type: String, required: true, unique: true, index: true, trim: true },
    fileName: { type: String, required: true, trim: true },
    uploadType: { type: String, enum: ['stock', 'plan'], required: true, index: true },
    warehouse: { type: String, default: 'China Warehouse', index: true, trim: true },
    targetContainer: { type: String, default: '', index: true, trim: true },
    totalRowsInFile: { type: Number, default: 0 },
    savedCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    duplicates: { type: [DuplicateItemSchema], default: [] },
    missingCount: { type: Number, default: 0 },
    missingDetails: { type: [MissingItemSchema], default: [] },
    receipts: { type: [String], default: [] },
    status: { type: String, enum: ['Active', 'Deleted'], default: 'Active', index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    strict: false,
  }
);

UploadHistorySchema.index({ uploadedAt: -1 });
UploadHistorySchema.index({ warehouse: 1, uploadType: 1 });

export default mongoose.models.UploadHistory || mongoose.model<IUploadHistory>('UploadHistory', UploadHistorySchema);
