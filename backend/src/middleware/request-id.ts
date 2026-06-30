import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../lib/request-context";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingRequestId = req.header("X-Request-ID");
  const requestId =
    incomingRequestId?.trim().match(UUID_V4_PATTERN) ? incomingRequestId.trim() : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  runWithRequestContext({ requestId }, () => next());
}
