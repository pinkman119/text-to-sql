import type { Request } from "express";
import { HttpError } from "../app/middleware/error_handler";

export function numParam(req: Request, name: string): number {
  const n = Number(req.params[name]);
  if (!Number.isFinite(n)) throw new HttpError(400, `invalid param: ${name}`);
  return n;
}
