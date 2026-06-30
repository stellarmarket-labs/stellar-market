import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { logger } from "../lib/logger";

export const validate = (schema: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ field: string; message: string }> = [];

    if (schema.body) {
      const result = schema.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            message: issue.message,
          })),
        );
      }
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query);
      if (result.success) {
        req.query = result.data as any;
      } else {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "query",
            message: issue.message,
          })),
        );
      }
    }

    if (schema.params) {
      const result = schema.params.safeParse(req.params);
      if (result.success) {
        req.params = result.data as any;
      } else {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "params",
            message: issue.message,
          })),
        );
      }
    }

    if (errors.length > 0) {
      logger.warn(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          errors,
        },
        "Validation failed",
      );
      return res.status(400).json({ errors });
    }

    next();
  };
};
