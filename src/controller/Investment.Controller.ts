import asyncHandler from "express-async-handler";
import type { NextFunction, Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { Investment } from "../models/Investment.model.js";
import { Project } from "../models/Project.model.js";
import { User } from "../models/User.model.js";
import { AppError } from "../utils/AppError.js";
import { applyInvestment } from "../service/investmentLogic.js";
import { buildInvestorPortfolio, toPercentage } from "../service/investorPortfolioRead.js";

function assertValidObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
}

export const invest = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const projectIdParamRaw = req.params.id;
  const projectIdParam = Array.isArray(projectIdParamRaw) ? projectIdParamRaw[0] : projectIdParamRaw;
  const investorId = req.user!.id;

  assertValidObjectId(projectIdParam, "project id");

  const { amount: amountFromBody, percentage }  = req.body as {
    amount?: number;
    percentage?: number;
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const project = await Project.findById(projectIdParam).session(session);
    if (!project) {
      throw new AppError("Project not found", 404);
    }

    let computedAmount: number | undefined = amountFromBody;

    if (percentage !== undefined) {
      const derived = Math.round((project.capital * percentage) / 100);
      if (derived <= 0) {
        throw new AppError("Percentage results in an invalid investment amount", 400);
      }

      if (computedAmount !== undefined) {
        if (Math.abs(computedAmount - derived) > 1) {
          throw new AppError("amount and percentage do not match project capital", 400);
        }
      } else {
        computedAmount = derived;
      }
    }

    if (computedAmount === undefined) {
      throw new AppError("Either amount or percentage is required", 400);
    }

    const result = await applyInvestment({
      investorId,
      projectId: projectIdParam,
      amount: computedAmount,
      session,
    });

    await session.commitTransaction();

    res.status(200).json({
      status: "success",
      data: {
        investment: result.investment,
        project: result.project,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

// GET /api/projects/:id/investors (owner lists investors of a project)
export const listProjectInvestors = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const projectIdParamRaw = req.params.id;
  const projectIdParam = Array.isArray(projectIdParamRaw) ? projectIdParamRaw[0] : projectIdParamRaw;
  const ownerId = req.user!.id;

  assertValidObjectId(projectIdParam, "project id");

  const project = await Project.findOne({
    _id: projectIdParam,
    ownerId,
  }).select("capital");

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  const projectObjectId = new Types.ObjectId(projectIdParam);

  const aggregated = await Investment.aggregate([
    { $match: { projectId: projectObjectId } },
    { $group: { _id: "$investorId", sumAmount: { $sum: "$amount" } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "investor",
      },
    },
    { $unwind: "$investor" },
    { $project: { investorId: "$_id", name: "$investor.name", sumAmount: 1 } },
  ]);

  const investors = aggregated.map((row) => {
    return {
      investorId: row.investorId.toString(),
      name: row.name,
      amountInvested: row.sumAmount,
      percentage: toPercentage(row.sumAmount, project.capital),
    };
  });

  res.status(200).json({
    status: "success",
    data: {
      projectId: projectIdParam,
      investors,
    },
  });
});

// GET /api/projects/:projectId/investors/:investorId/portfolio (owner portfolio for a specific investor)
export const getOwnerInvestorPortfolio = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const projectIdParamRaw = req.params.projectId;
    const projectIdParam = Array.isArray(projectIdParamRaw) ? projectIdParamRaw[0] : projectIdParamRaw;
    const investorIdParamRaw = req.params.investorId;
    const investorIdParam = Array.isArray(investorIdParamRaw) ? investorIdParamRaw[0] : investorIdParamRaw;
    const ownerId = req.user!.id;

    assertValidObjectId(projectIdParam, "project id");
    assertValidObjectId(investorIdParam, "investor id");

    const ownedProject = await Project.findOne({ _id: projectIdParam, ownerId }).select("_id");
    if (!ownedProject) {
      throw new AppError("Project not found", 404);
    }

    const investorObjectId = new Types.ObjectId(investorIdParam);
    const ownerObjectId = new Types.ObjectId(ownerId);

    const portfolioAgg = await Investment.aggregate([
      { $match: { investorId: investorObjectId } },
      {
        $lookup: {
          from: Project.collection.name,
          localField: "projectId",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: "$project" },
      { $match: { "project.ownerId": ownerObjectId } },
      {
        $group: {
          _id: "$project._id",
          amountInvested: { $sum: "$amount" },
          project: { $first: "$project" },
        },
      },
      {
        $project: {
          projectId: "$_id",
          amountInvested: 1,
          title: "$project.title",
          capital: "$project.capital",
          status: "$project.status",
        },
      },
    ]);

    const portfolio = portfolioAgg.map((row) => ({
      projectId: row.projectId.toString(),
      title: row.title,
      amountInvested: row.amountInvested,
      percentage: toPercentage(row.amountInvested, row.capital),
      status: row.status,
    }));

    const totalInvested = portfolioAgg.reduce((sum, row) => sum + row.amountInvested, 0);

    res.status(200).json({
      status: "success",
      data: {
        investorId: investorIdParam,
        portfolio,
        totalInvested,
      },
    });
  },
);

// GET /api/investments/me (for current user: investorId=req.user.id)
export const getMyInvestments = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const investorId = req.user!.id;

  assertValidObjectId(investorId, "investor id");

  const { investments, totalInvested } = await buildInvestorPortfolio(new Types.ObjectId(investorId));

  res.status(200).json({
    status: "success",
    data: {
      investments,
      totalInvested,
    },
  });
});

