import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";

const PROTECTED_ROUTES = ["/dashboard", "/post-job", "/messages", "/profile"];
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("stellarmarket_jwt")?.value;
  const { pathname } = request.nextUrl;

  // 1. If user is authenticated and tries to access auth pages, redirect to dashboard
  if (token && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. If user is NOT authenticated and tries to access protected pages, redirect to login
  if (!token && PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Generate a cryptographically random nonce for each request
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

  const requestHeaders = new Headers(request.headers);
  // Pass nonce to the page via a header so layout can read it
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-csp", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set security headers on every response
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  // Apply to all routes except Next.js internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
  runtime: "nodejs",
};
