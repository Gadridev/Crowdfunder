import mongoose, { type Document, model, Schema, type Types } from "mongoose";

export const PROJECT_STATUSES = ["open", "closed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface IProject extends Document {
  ownerId: Types.ObjectId;
  title: string;
  description: string;
  capital: number;
  currentAmount: number;
  maxInvestmentPercentage: number;
  status: ProjectStatus;
}

const projectSchema = new Schema<IProject>(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 2000,
    },
    capital: {
      type: Number,
      required: true,
      min: 1,
    },
    currentAmount: { type: Number, default: 0, min: 0 },
    maxInvestmentPercentage: { type: Number, required: true, min: 0, max: 50 },
    status: { type: String, enum: PROJECT_STATUSES, default: "open", index: true },
  },
  { timestamps: true },
);

projectSchema.index({ ownerId: 1, createdAt: -1 });
projectSchema.index({ status: 1 });

export const Project = model<IProject>("Project", projectSchema);
