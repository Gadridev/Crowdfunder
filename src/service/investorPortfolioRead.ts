import { Types } from "mongoose";
import { Investment } from "../models/Investment.model.js";
import { Project } from "../models/Project.model.js";

export function toPercentage(amount: number, capital: number): number {
  if (capital <= 0) return 0;
  return Number(((amount / capital) * 100).toFixed(2));
}

export type InvestorPortfolioRow = {
  projectId: string;
  title: string;
  capital: number;
  status: string;
  amountInvested: number;
  percentage: number;
};

export async function buildInvestorPortfolio(investorObjectId: Types.ObjectId): Promise<{
  investments: InvestorPortfolioRow[];
  totalInvested: number;
}> {
  const agg = await Investment.aggregate([
    { $match: { investorId: investorObjectId } },
    { $group: { _id: "$projectId", sumAmount: { $sum: "$amount" } } },
    {
      $lookup: {
        from: Project.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "project",
      },
    },
    { $unwind: "$project" },
    {
      $project: {
        projectId: "$_id",
        title: "$project.title",
        capital: "$project.capital",
        status: "$project.status",
        amountInvested: "$sumAmount",
      },
    },
  ]);

  const investments: InvestorPortfolioRow[] = agg.map((row) => ({
    projectId: row.projectId.toString(),
    title: row.title,
    capital: row.capital,
    status: row.status,
    amountInvested: row.amountInvested,
    percentage: toPercentage(row.amountInvested, row.capital),
  }));

  const totalInvested = investments.reduce((sum, row) => sum + row.amountInvested, 0);

  return { investments, totalInvested };
}
