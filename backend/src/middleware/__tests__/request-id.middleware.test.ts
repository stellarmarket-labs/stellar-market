import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../request-id";

describe("requestIdMiddleware", () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/ping", (req, res) => {
    res.json({ requestId: req.requestId });
  });

  it("reuses the incoming X-Request-ID header", async () => {
    const incomingRequestId = "550e8400-e29b-41d4-a716-446655440000";
    const response = await request(app)
      .get("/ping")
      .set("X-Request-ID", incomingRequestId);

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe(incomingRequestId);
    expect(response.body.requestId).toBe(incomingRequestId);
  });

  it("generates a request ID when the header is missing or invalid", async () => {
    const response = await request(app)
      .get("/ping")
      .set("X-Request-ID", "not-a-uuid");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });
});
