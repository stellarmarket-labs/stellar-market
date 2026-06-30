import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export function requestLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
      },
      "Request completed",
    );
  });

  next();
}
