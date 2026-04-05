import { z } from "zod";

export const projectCreateBodySchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(2000),
    capital: z.number().int().positive(),
    maxInvestmentPercentage: z.number().min(0).max(50),
    initialInvestmentAmount: z.number().int().positive().optional(),
    initialInvestmentPercentage: z.number().positive().max(100).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.initialInvestmentAmount !== undefined && data.initialInvestmentPercentage !== undefined) {
      const derived = Math.round((data.capital * data.initialInvestmentPercentage) / 100);
      if (Math.abs(data.initialInvestmentAmount - derived) > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "initialInvestmentAmount must match initialInvestmentPercentage of capital",
          path: ["initialInvestmentAmount"],
        });
      }
    }
  });

export const projectUpdateBodySchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(20).max(2000).optional(),
    capital: z.number().int().positive().optional(),
    maxInvestmentPercentage: z.number().min(0).max(50).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");

