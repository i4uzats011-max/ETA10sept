import mongoose, { Schema, Document, Model } from 'mongoose';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface IEditLog extends Document {
  username: string;              // User who performed the CUD operation
  role?: string;                 // User role (admin, staff, biller, dispatcher, developer)
  action: AuditAction;           // 'CREATE' | 'UPDATE' | 'DELETE'
  entityType: string;            // 'Container' | 'Shipment' | 'WarehouseReceipt' | 'Bill' | 'LoadingPlan' | etc.
  entityId?: string;             // Identifier e.g. container name ('USSI-254') or receipt ('R-10023')
  description: string;           // Human readable summary of the change
  details?: Record<string, any>; // Specific changed fields or payload
  ip?: string;                   // Client IP address
  userAgent?: string;            // User agent
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EditLogSchema = new Schema<IEditLog>(
  {
    username: { type: String, required: true, index: true, trim: true },
    role: { type: String, default: 'admin', trim: true },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'DELETE'],
      required: true,
      index: true,
    },
    entityType: { type: String, required: true, index: true, trim: true },
    entityId: { type: String, default: '', index: true, trim: true },
    description: { type: String, default: '', trim: true },
    details: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    collection: 'edit_logs',
  }
);

const EditLog: Model<IEditLog> =
  mongoose.models.EditLog || mongoose.model<IEditLog>('EditLog', EditLogSchema);

export default EditLog;
