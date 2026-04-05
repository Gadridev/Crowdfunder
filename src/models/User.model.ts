import { Schema, model, type Document } from "mongoose";
import type { UserRole } from "../constants/roles.js";
import { USER_ROLES } from "../constants/roles.js";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /.+\@.+\..+/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
    },
  },
  { timestamps: true },
);
export const User = model<IUser>("User", userSchema);