import mongoose, { Schema, Document } from 'mongoose';

export interface IShippingLine extends Document {
  name: string;             // Carrier identifier / code (e.g. 'MSC', 'MAERSK', 'COSCO', 'WAN_HAI')
  displayName: string;      // Full commercial / company name (e.g. 'Mediterranean Shipping Company')
  prefix?: string;          // Common container prefix(es) (e.g. 'MSCU, MEDU')
  website?: string;         // Official carrier tracking website
  notes?: string;           // Internal remarks or notes
  active: boolean;          // Active flag
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_SHIPPING_LINES: Array<{
  name: string;
  displayName: string;
  prefix?: string;
  website?: string;
}> = [
  { name: 'MSC', displayName: 'Mediterranean Shipping Company', prefix: 'MSCU, MEDU, MSMU, MSTU', website: 'https://www.msc.com' },
  { name: 'MAERSK', displayName: 'A.P. Moller - Maersk', prefix: 'MAEU, MSKU, MSFU, MRAU', website: 'https://www.maersk.com' },
  { name: 'CMA_CGM', displayName: 'CMA CGM Group', prefix: 'CMAU, APZU, ECXU, CGMU', website: 'https://www.cma-cgm.com' },
  { name: 'HAPAG_LLOYD', displayName: 'Hapag-Lloyd', prefix: 'HLCU, HLXU', website: 'https://www.hapag-lloyd.com' },
  { name: 'COSCO', displayName: 'COSCO SHIPPING Lines Co', prefix: 'COSU, CBHU, CCLU, CSQU', website: 'https://lines.coscoshipping.com' },
  { name: 'ONE', displayName: 'Ocean Network Express', prefix: 'ONEU, NYKU, MOLU, KLINE, KLFU', website: 'https://www.one-line.com' },
  { name: 'EVERGREEN', displayName: 'Evergreen Marine Corp', prefix: 'EMCU, EISU, EGHU, UGMU', website: 'https://www.evergreen-marine.com' },
  { name: 'YANG_MING', displayName: 'Yang Ming Marine Transport', prefix: 'YMLU, YMCU', website: 'https://www.yangming.com' },
  { name: 'HMM', displayName: 'Hyundai Merchant Marine', prefix: 'HDMU, HMMU, KOCU, CAIU, CLKU, GAOU, ROEU, TGBU', website: 'https://www.hmm21.com' },
  { name: 'ZIM', displayName: 'Zim Integrated Shipping Services', prefix: 'ZIMU, ZCSU', website: 'https://www.zim.com' },
  { name: 'PIL', displayName: 'Pacific International Lines', prefix: 'PILU, PCIU', website: 'https://www.pilship.com' },
  { name: 'WAN_HAI', displayName: 'Wan Hai Lines Ltd', prefix: 'WHLU', website: 'https://www.wanhai.com' },
  { name: 'OOCL', displayName: 'Orient Overseas Container Line', prefix: 'OOLU', website: 'https://www.oocl.com' },
];

const ShippingLineSchema = new Schema<IShippingLine>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
    },
    prefix: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    website: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ShippingLine || mongoose.model<IShippingLine>('ShippingLine', ShippingLineSchema);
