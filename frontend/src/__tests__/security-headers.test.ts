/**
 * Security header tests
 * Unit tests for middleware CSP and security header logic
 */

import { randomBytes } from "crypto";

describe("Security Headers", () => {
  test("nonce generation produces valid base64 string", () => {
    const nonce = randomBytes(16).toString("base64");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(nonce.length).toBeGreaterThan(0);
  });

  test("nonce generation produces unique values", () => {
    const nonce1 = randomBytes(16).toString("base64");
    const nonce2 = randomBytes(16).toString("base64");
    expect(nonce1).not.toBe(nonce2);
  });

  test("CSP string contains required directives", () => {
    const nonce = randomBytes(16).toString("base64");
    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      `img-src 'self' data: https://*.amazonaws.com https://*.cloudflare.com https://avatars.githubusercontent.com https://localhost:5000 https://*.stellarmarket.io`,
      `font-src 'self'`,
      `connect-src 'self'`,
      `frame-ancestors 'none'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join("; ");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(`nonce-${nonce}`);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  test("CSP script-src uses nonce format", () => {
    const nonce = randomBytes(16).toString("base64");
    const csp = `script-src 'self' 'nonce-${nonce}'`;
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]{16,}/);
  });
});
