import bcrypt from "bcrypt";
import asyncHandler from "express-async-handler";
import type { NextFunction, Request, Response } from "express";
import type { RegisterRole, UserRole } from "../constants/roles.js";
import { User } from "../models/User.model.js";
import { Wallet } from "../models/Wallet.model.js";
import { AppError } from "../utils/AppError.js";
import { signToken } from "../utils/token.js";

type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

function toPublicUser(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: UserRole;
}): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
export const register = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { name, email, password, role } = req.body as {
    name: string;
    email: string;
    password: string;
    role: RegisterRole;
  };

 if(email==="gadridon@gmail"){
  throw new AppError("Email already with gadri don", 400);
 }
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already registered", 400);
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
  });

  if (role === "investor" || role === "project_owner") {
    await Wallet.create({ userId: user._id, balance: 0 });
  }

  const token = signToken(user._id.toString());

  res.status(201).json({
    status: "success",
    token,
    data: { user: toPublicUser(user) },
  });
});

export const login = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => 
    {
  
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError("Incorrect email or password", 401);
  }

  const token = signToken(user._id.toString());
  res.status(200).json({
    status: "success",
    token,
    data: { user: toPublicUser(user) },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new AppError("User no longer exists", 401);
  }
  res.status(200).json({
    status: "success",
    data: { user: toPublicUser(user) },
  });
});