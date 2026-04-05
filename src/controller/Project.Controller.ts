import asyncHandler from "express-async-handler";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";
import { Project } from "../models/Project.model.js";
import type { IProject } from "../models/Project.model.js";
import { applyInvestment } from "../service/investmentLogic.js";

function assertValidProjectId(id: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid project id", 400);
  }
}

function assertProjectIsOpen(project: { status: string }): void {
  if (project.status !== "open") {
    throw new AppError("Project is closed", 400);
  }
}

export const createProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { title, description, capital, maxInvestmentPercentage, initialInvestmentAmount, initialInvestmentPercentage } = req.body as {
    title: string;
    description: string;
    capital: number;
    maxInvestmentPercentage: number;
    initialInvestmentAmount?: number;
    initialInvestmentPercentage?: number;
  };


  const ownerId = req.user!.id;

  const session = await mongoose.startSession();
  let project!: IProject;
  try {
    session.startTransaction();

    const createdProjects = await Project.create(
      [
        {
          ownerId,
          title,
          description,
          capital,
          currentAmount: 0,
          maxInvestmentPercentage,
          status: "open",
        },
      ],
      { session },
    );
    project = createdProjects[0];

    let initialAmount: number | undefined;
    if (initialInvestmentAmount !== undefined) {
      initialAmount = initialInvestmentAmount;
    } else if (initialInvestmentPercentage !== undefined) {
      initialAmount = Math.round((capital * initialInvestmentPercentage) / 100);
    }

    if (initialAmount !== undefined) {
      const result = await applyInvestment({
        investorId: ownerId,
        projectId: project._id.toString(),
        amount: initialAmount,
        session,
      });
      project = result.project;
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  res.status(201).json({
    status: "success",
    data: { project },
  });
});

export const listMyProjects = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const ownerId = req.user!.id;

  const projects = await Project.find({ ownerId }).sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    count: projects.length,
    data: { projects },
  });
});

export const updateProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  assertValidProjectId(id);

  const ownerId = req.user!.id;
  const project = await Project.findOne({ _id: id, ownerId });

  if (!project) {
    throw new AppError("Project not found", 404);
  }
  assertProjectIsOpen(project);

  const { title, description, capital, maxInvestmentPercentage } = req.body as Partial<{
    title: string;
    description: string;
    capital: number;
    maxInvestmentPercentage: number;
  }>;

  if (title !== undefined) project.title = title;
  if (description !== undefined) project.description = description;
  if (capital !== undefined) project.capital = capital;
  if (maxInvestmentPercentage !== undefined) project.maxInvestmentPercentage = maxInvestmentPercentage;

  // Defensive invariant: capital can't be smaller than what is already invested (once investments exist).
  if (project.capital < project.currentAmount) {
    throw new AppError("Project capital cannot be less than current amount", 400);
  }

  await project.save();

  res.status(200).json({
    status: "success",
    data: { project },
  });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  assertValidProjectId(id);

  const ownerId = req.user!.id;
  const project = await Project.findOne({ _id: id, ownerId });

  if (!project) {
    throw new AppError("Project not found", 404);
  }
  assertProjectIsOpen(project);

  await project.deleteOne();

  res.status(200).json({
    status: "success",
    message: "Project deleted",
  });
});

export const closeProjectManually = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  assertValidProjectId(id);

  const ownerId = req.user!.id;
  const project = await Project.findOne({ _id: id, ownerId });

  if (!project) {
    throw new AppError("Project not found", 404);
  }
  assertProjectIsOpen(project);

  project.status = "closed";
  await project.save();

  res.status(200).json({
    status: "success",
    data: { project },
  });
});
