import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from "dns/promises";
import { logger } from "./logger";

interface ResolutionResult {
  ips: string[];
  error?: string;
}

async function resolveHostname(hostname: string): Promise<ResolutionResult> {
  try {
    const ips: string[] = [];

    try {
      const ipv4Addresses = await dnsResolve4(hostname);
      ips.push(...ipv4Addresses);
    } catch {
      // IPv4 resolution failed, continue trying IPv6
    }

    try {
      const ipv6Addresses = await dnsResolve6(hostname);
      ips.push(...ipv6Addresses);
    } catch {
      // IPv6 resolution failed, continue
    }

    if (ips.length === 0) {
      return { ips: [], error: "No addresses resolved" };
    }

    return { ips };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ips: [], error };
  }
}

function isPrivateIPv4(ip: string): boolean {
  if (ip === "169.254.169.254") return true;

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4) return false;

  const [first, second] = octets;

  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;

  return false;
}

export async function validateWebhookUrl(url: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    if (!hostname) {
      return { valid: false, reason: "Invalid URL: no hostname" };
    }

    const resolution = await resolveHostname(hostname);
    if (resolution.error) {
      logger.warn({ hostname, err: resolution.error }, "Failed to resolve webhook hostname");
      return { valid: false, reason: `DNS resolution failed: ${resolution.error}` };
    }

    if (resolution.ips.length === 0) {
      return { valid: false, reason: "DNS resolution returned no addresses" };
    }

    for (const ip of resolution.ips) {
      if (ip === "169.254.169.254") {
        return { valid: false, reason: "Webhook URL resolves to AWS metadata endpoint (169.254.169.254)" };
      }

      if (ip === "127.0.0.1" || isPrivateIPv4(ip)) {
        return { valid: false, reason: `Webhook URL resolves to private IPv4 address: ${ip}` };
      }

      if (isPrivateIPv6(ip)) {
        return { valid: false, reason: `Webhook URL resolves to private IPv6 address: ${ip}` };
      }
    }

    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `URL validation error: ${message}` };
  }
}
