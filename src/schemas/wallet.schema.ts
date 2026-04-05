import { z } from "zod";

export const topUpBodySchema = z
  .object({
    amount: z.number().int().positive(),
  })
  .strict();

