import asyncHandler from "express-async-handler";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { Project } from "../models/Project.model.js";
import { User } from "../models/User.model.js";
import { AppError } from "../utils/AppError.js";
import { buildInvestorPortfolio } from "../service/investorPortfolioRead.js";

function assertValidObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
}

function publicUserListItem(user: { _id: { toString(): string }; name: string; email: string; role: string; createdAt?: Date }) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/** GET /api/admin/investors */
export const listInvestors = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const users = await User.find({ role: "investor" }).sort({ createdAt: -1 }).select("name email role createdAt");

  res.status(200).json({
    status: "success",
    count: users.length,
    data: { investors: users.map((u) => publicUserListItem(u)) },
  });
});

/** GET /api/admin/project-owners */
export const listProjectOwners = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
  const users = await User.find({ role: "project_owner" }).sort({ createdAt: -1 }).select("name email role createdAt");

  res.status(200).json({
    status: "success",
    count: users.length,
    data: { projectOwners: users.map((u) => publicUserListItem(u)) },
  });
});

/** GET /api/admin/investors/:investorId/portfolio */
export const getInvestorPortfolioAdmin = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const raw = req.params.investorId;
  const investorId = Array.isArray(raw) ? raw[0] : raw;
  assertValidObjectId(investorId, "investor id");

  const user = await User.findById(investorId).select("role name email");
  if (!user) {
    throw new AppError("User not found", 404);
  }
  if (user.role !== "investor") {
    throw new AppError("User is not an investor", 400);
  }

  const { investments, totalInvested } = await buildInvestorPortfolio(new Types.ObjectId(investorId));

  res.status(200).json({
    status: "success",
    data: {
      investor: { id: investorId, name: user.name, email: user.email },
      investments,
      totalInvested,
    },
  });
});

/** GET /api/admin/project-owners/:ownerId/portfolio */
export const getProjectOwnerPortfolioAdmin = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const raw = req.params.ownerId;
  const ownerId = Array.isArray(raw) ? raw[0] : raw;
  assertValidObjectId(ownerId, "owner id");

  const user = await User.findById(ownerId).select("role name email");
  if (!user) {
    throw new AppError("User not found", 404);
  }
  if (user.role !== "project_owner") {
    throw new AppError("User is not a project owner", 400);
  }

  const ownerObjectId = new Types.ObjectId(ownerId);
  const projects = await Project.find({ ownerId: ownerObjectId }).sort({ createdAt: -1 });

  const projectsPayload = projects.map((p) => ({
    projectId: p._id.toString(),
    title: p.title,
    capital: p.capital,
    currentAmount: p.currentAmount,
    amountRaisedPercentage: p.capital > 0 ? Number(((p.currentAmount / p.capital) * 100).toFixed(2)) : 0,
    status: p.status,
    maxInvestmentPercentage: p.maxInvestmentPercentage
  }));

  const totalRaisedAcrossProjects = projects.reduce((sum, p) => sum + p.currentAmount, 0);

  res.status(200).json({
    status: "success",
    data: {
      owner: { id: ownerId, name: user.name, email: user.email },
      projects: projectsPayload,
      projectCount: projects.length,
      totalRaisedAcrossProjects,
    },
  });
});
