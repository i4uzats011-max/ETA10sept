import mongoose, { Schema, Document } from 'mongoose';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskSource = 'MANUAL' | 'TRANSACTION' | 'COMPLIANCE';

export interface IDailyTask extends Document {
  title: string;
  description?: string;
  dueDate: Date;
  isCompleted: boolean;
  priority: TaskPriority;
  source: TaskSource;
  relatedTransactionId?: mongoose.Types.ObjectId;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DailyTaskSchema = new Schema<IDailyTask>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    dueDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM',
    },
    source: {
      type: String,
      enum: ['MANUAL', 'TRANSACTION', 'COMPLIANCE'],
      default: 'MANUAL',
    },
    relatedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'KhataTransaction',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.DailyTask ||
  mongoose.model<IDailyTask>('DailyTask', DailyTaskSchema);
