import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

function isMongoDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: "fail",
      message: err.message,
    });
  }

  if (isMongoDuplicateKey(err)) {
    return res.status(400).json({
      status: "fail",
      message: "Duplicate field value — this resource already exists.",
    });
  }

  console.error(err);
  const message =
    process.env.NODE_ENV === "development" && err instanceof Error
      ? err.message
      : "Something went wrong";

  return res.status(500).json({
    status: "error",
    message,
  });
}
