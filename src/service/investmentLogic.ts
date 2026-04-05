import mongoose, { Types } from "mongoose";
import { Project } from "../models/Project.model.js";
import { Wallet } from "../models/Wallet.model.js";
import { Investment } from "../models/Investment.model.js";
import { AppError } from "../utils/AppError.js";

function assertIsNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(`${fieldName} must be a non-negative integer`, 400);
  }
}

type ApplyInvestmentArgs = {
  investorId: string;
  projectId: string;
  amount: number;
  session: mongoose.ClientSession;
};

/**
 * Shared atomic investment logic.
 * Caller must start/commit/abort the MongoDB transaction and pass `session`.
 */
export async function applyInvestment(args: ApplyInvestmentArgs) {
  const { investorId, projectId, amount, session } = args;

  assertIsNonNegativeInteger(amount, "amount");
  if (amount === 0) {
    throw new AppError("Investment amount must be greater than 0", 400);
  }

  if (!Types.ObjectId.isValid(investorId)) {
    throw new AppError("Invalid investor id", 400);
  }
  if (!Types.ObjectId.isValid(projectId)) {
    throw new AppError("Invalid project id", 400);
  }

  const investorObjectId = new Types.ObjectId(investorId);
  const projectObjectId = new Types.ObjectId(projectId);

  const project = await Project.findById(projectObjectId).session(session);
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  if (project.status !== "open") {
    throw new AppError("Project is closed", 400);
  }

  const remainingCapital = project.capital - project.currentAmount;
  if (remainingCapital < amount) {
    throw new AppError("Not enough remaining capital", 400);
  }

  // Enforce per-investor cap for this project.
  const existingAgg = await Investment.aggregate([
    {
      $match: {
        investorId: investorObjectId,
        projectId: projectObjectId,
      },
    },
    {
      $group: {
        _id: null,
        sumAmount: { $sum: "$amount" },
      },
    },
  ]).session(session);

  const existingSumAmount = existingAgg[0]?.sumAmount ?? 0;
  const perInvestorCapAmount = (project.capital * project.maxInvestmentPercentage) / 100;

  // Epsilon to avoid float comparison issues.
  if (existingSumAmount + amount > perInvestorCapAmount + 1e-9) {
    throw new AppError("Investment exceeds per-investor cap", 400);
  }

  const wallet = await Wallet.findOne({ userId: investorObjectId }).session(session);
  if (!wallet) {
    throw new AppError("Wallet not found for this user please create wallet and then invest", 404);
  }

  if (wallet.balance < amount) {
    throw new AppError("Insufficient wallet balance", 400);
  }

  // Apply updates.
  wallet.balance -= amount;
  project.currentAmount += amount;

  if (project.currentAmount >= project.capital) {
    project.status = "closed";
  }

  const investment = await Investment.create(
    [
      {
        investorId: investorObjectId,
        projectId: projectObjectId,
        amount,
      },
    ],
    { session },
  );

  await wallet.save({ session });
  await project.save({ session });

  // Investment.create([...]) returns an array.
  return { investment: investment[0], project, wallet };
}

