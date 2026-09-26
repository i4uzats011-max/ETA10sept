import mongoose, { Schema, Document } from 'mongoose';

export interface IItemHsn extends Document {
  itemName: string;          // Normalized product/commodity name
  hsnCode: string;           // 4 to 8 digit HSN/SAC code
  description?: string;      // Goods description
  category?: string;         // Category (e.g. Toys, Baby Care, Plastics)
  gstRate: number;           // Standard IGST rate percentage (e.g. 18, 12, 5, 28)
  usageCount: number;        // How many times this HSN was used for this item
  source: 'user_saved' | 'auto_learned' | 'catalog';
  createdAt: Date;
  updatedAt: Date;
}

const ItemHsnSchema = new Schema<IItemHsn>(
  {
    itemName: { type: String, required: true, trim: true, uppercase: true, unique: true },
    hsnCode: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: 'General Cargo', trim: true },
    gstRate: { type: Number, default: 18 },
    usageCount: { type: Number, default: 1 },
    source: {
      type: String,
      enum: ['user_saved', 'auto_learned', 'catalog'],
      default: 'user_saved',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ItemHsn || mongoose.model<IItemHsn>('ItemHsn', ItemHsnSchema);
