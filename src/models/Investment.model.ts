import mongoose, { type Document, model, Schema, type Types } from "mongoose";

export interface IInvestment extends Document {
  investorId: Types.ObjectId;
  projectId: Types.ObjectId;
  amount: number;
}

const investmentSchema = new Schema<IInvestment>(
  {
    investorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "Amount must be a positive integer",
      },
    },
  },
  { timestamps: true },
);

// Used by portfolio/aggregations scoped to (project, investor)
investmentSchema.index({ projectId: 1, investorId: 1 });

export const Investment = model<IInvestment>("Investment", investmentSchema);

