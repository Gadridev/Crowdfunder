import { z } from "zod";

export const investBodySchema = z
  .object({
    amount: z.number().int().positive().optional(),
    percentage: z.number().positive().max(100).optional(),
  })
  .strict()
  .refine((v) => v.amount !== undefined || v.percentage !== undefined, {
    message: "Either amount or percentage is required",
  });

