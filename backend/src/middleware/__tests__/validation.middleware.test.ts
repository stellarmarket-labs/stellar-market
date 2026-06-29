import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "../validation";

describe("validate middleware", () => {
  it("returns structured 400 errors for missing required fields", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/users",
      validate({
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }),
      }),
      (_req, res) => res.json({ ok: true }),
    );

    const response = await request(app)
      .post("/users")
      .send({ email: "user@example.com" });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "password",
        }),
      ]),
    );
  });

  it("strips unknown fields from the request body", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/users",
      validate({
        body: z.object({
          email: z.string().email(),
        }),
      }),
      (req, res) => res.json({ body: req.body }),
    );

    const response = await request(app).post("/users").send({
      email: "user@example.com",
      password: "super-secret",
    });

    expect(response.status).toBe(200);
    expect(response.body.body).toEqual({ email: "user@example.com" });
  });
});
