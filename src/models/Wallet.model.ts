import mongoose, { type Document, model, Schema, type Types } from "mongoose";

export interface IWallet extends Document {
  userId: Types.ObjectId;
  balance: number;
}
const walletSchema = new Schema<IWallet>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
});
export const Wallet = model<IWallet>("Wallet", walletSchema);