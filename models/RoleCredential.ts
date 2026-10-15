import mongoose, { Schema, Model } from 'mongoose';
import { UserRole } from '@/lib/auth';

export interface IRoleCredential {
  _id?: any;
  role: UserRole;
  passwordHash: string;
  roleName: string;
  updatedBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const RoleCredentialSchema: Schema = new Schema<IRoleCredential>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ['admin', 'staff', 'biller', 'dispatcher', 'developer'],
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    roleName: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

const RoleCredential: Model<IRoleCredential> =
  mongoose.models.RoleCredential ||
  mongoose.model<IRoleCredential>('RoleCredential', RoleCredentialSchema);

export default RoleCredential;
