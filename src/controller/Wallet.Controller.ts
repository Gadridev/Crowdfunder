import asyncHandler from "express-async-handler";
import type { NextFunction, Request, Response } from "express";
import { Wallet } from "../models/Wallet.model.js";
import { AppError } from "../utils/AppError.js";

export const topUp = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { amount } = req.body as { amount: number };
  const userId = req.user!.id;

  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    // Wallet should exist for registered roles, but keep this safe.
    wallet = await Wallet.create({ userId, balance: 0 });
  }

  wallet.balance += amount;
  await wallet.save();

  res.status(200).json({
    status: "success",
    data: { wallet },
  });
});

