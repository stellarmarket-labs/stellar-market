import pino from "pino";
import { getRequestId } from "./request-context";

const isProd = process.env.NODE_ENV === "production";
const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  base: undefined,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  redact: {
    paths: [
      "password",
      "token",
      "secret",
      "authorization",
      "req.headers.authorization",
      "req.body.password",
      "req.body.token",
      "req.body.secret",
      "req.query.token",
      "req.params.token",
      "body.password",
      "body.token",
      "body.secret",
      "query.token",
      "params.token",
    ],
    censor: "[REDACTED]",
  },
  mixin() {
    const requestId = getRequestId();
    return { requestId: requestId ?? "system" };
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: false,
            translateTime: "SYS:standard",
          },
        },
      }
    : {}),
});

export function installRequestIdConsolePatch(): void {
  return;
}
