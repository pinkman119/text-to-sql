import type { NextFunction, Request, Response } from "express";

class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err as any;
  const status = typeof e?.status === "number" ? e.status : 500;
  const message = typeof e?.message === "string" ? e.message : "Internal Server Error";

  res.status(status).json({
    success: false,
    message,
    details: e?.details,
  });
}

export { HttpError, errorHandler };
