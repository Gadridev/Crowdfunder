import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import type { UserRole } from "../constants/roles.js";
import { User } from "../models/User.model.js";
import { AppError } from "../utils/AppError.js";

export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  let token: string | undefined;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return next(new AppError("You are not logged in. Please log in to get access.", 401));
  }

  let decoded: { id: string };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
  } catch {
    return next(new AppError("Invalid token. Please log in again.", 401));
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError("The user belonging to this token no longer exists.", 401));
  }

  req.user = { id: user._id.toString(), role: user.role };
  next();
});

export const restrictTo = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("User not authenticated", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action", 403));
    }
    next();
  };
};
