import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../utils/AppError.js";

export function validateBody<S extends z.ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(", ");
      return next(new AppError(message, 400));
    }
    req.body = result.data as z.infer<S>;
    next();
  };
}
