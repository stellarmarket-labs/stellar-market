import jwt from "jsonwebtoken";
import { config } from "../../config";
import { EmailService } from "../email.service";

/**
 * Regression test for stellarmarket-labs/stellar-market#1210:
 * the unsubscribe link must point at a frontend page that calls the
 * backend API client-side (matching verify-email/reset-password), not at
 * the backend's own `/api/v1/unsubscribe` route, which 404s under the
 * frontend origin when clicked from an email.
 */
describe("EmailService.buildUnsubscribeUrl (#1210)", () => {
  it("points at the frontend unsubscribe page, not a backend API path", () => {
    const url = EmailService.buildUnsubscribeUrl("user-1");

    expect(url.startsWith(`${config.frontendUrl}/unsubscribe?token=`)).toBe(
      true,
    );
    expect(url).not.toContain("/api/");
  });

  it("embeds a verifiable unsubscribe JWT in the token param", () => {
    const url = EmailService.buildUnsubscribeUrl("user-1");
    const token = new URL(url).searchParams.get("token") ?? "";

    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      type: string;
    };

    expect(payload.userId).toBe("user-1");
    expect(payload.type).toBe("unsubscribe");
  });
});
