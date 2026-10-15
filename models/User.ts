import mongoose, { Schema, Model } from 'mongoose';
import { UserRole } from '@/lib/auth';

export interface IUser {
  _id?: any;
  username: string;
  name?: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdBy?: string;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema: Schema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'staff', 'biller', 'dispatcher', 'developer'],
      default: 'staff',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: String,
      default: 'developer',
      trim: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserSchema.index({ role: 1, isActive: 1 });

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
