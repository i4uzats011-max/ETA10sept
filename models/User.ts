import mongoose, { Schema, Model } from 'mongoose';
import { UserRole } from '@/lib/auth';

export interface IUser {
  _id?: any;
  username: string;
  name?: string;
  passwordHash: string;
  plainPasswordView?: string;
  role: UserRole;
  phone?: string;
  email?: string;
  salesNotes?: string;
  isActive: boolean;
  adminAccessGranted?: boolean;
  adminAccessGrantedBy?: string;
  adminAccessGrantedAt?: Date | null;
  createdBy?: string;
  lastModifiedBy?: string;
  lastModifiedByRole?: string;
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
    plainPasswordView: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['admin', 'staff', 'biller', 'dispatcher', 'developer', 'sales_head', 'sales_person', 'operations_head'],
      default: 'staff',
      required: true,
      index: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
    },
    salesNotes: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    adminAccessGranted: {
      type: Boolean,
      default: false,
      index: true,
    },
    adminAccessGrantedBy: {
      type: String,
      default: '',
      trim: true,
    },
    adminAccessGrantedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      default: 'developer',
      trim: true,
    },
    lastModifiedBy: {
      type: String,
      default: '',
      trim: true,
    },
    lastModifiedByRole: {
      type: String,
      default: '',
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
UserSchema.index({ role: 1, adminAccessGranted: 1 });

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
