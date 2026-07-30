import { validateWebhookUrl } from "../ip-validation";
import * as dnsPromises from "dns/promises";

jest.mock("dns/promises");

describe("IP Validation — validateWebhookUrl", () => {
  const mockResolve4 = dnsPromises.resolve4 as jest.MockedFunction<typeof dnsPromises.resolve4>;
  const mockResolve6 = dnsPromises.resolve6 as jest.MockedFunction<typeof dnsPromises.resolve6>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolve6.mockRejectedValue(new Error("ENODATA"));
  });

  describe("IPv4 private range detection", () => {
    it("rejects localhost (127.0.0.1)", async () => {
      mockResolve4.mockResolvedValue(["127.0.0.1"] as any);

      const result = await validateWebhookUrl("http://localhost/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("127.0.0.1");
    });

    it("rejects loopback range (127.x.x.x)", async () => {
      mockResolve4.mockResolvedValue(["127.1.1.1"] as any);

      const result = await validateWebhookUrl("http://internal/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("127.1.1.1");
    });

    it("rejects 10.0.0.0/8 range", async () => {
      mockResolve4.mockResolvedValue(["10.0.0.1"] as any);

      const result = await validateWebhookUrl("http://internal.corp/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("10.0.0.1");
    });

    it("rejects 172.16.0.0/12 range", async () => {
      mockResolve4.mockResolvedValue(["172.16.0.1"] as any);

      const result = await validateWebhookUrl("http://internal.corp/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("172.16.0.1");
    });

    it("rejects 172.31.255.255 (end of 172.16.0.0/12)", async () => {
      mockResolve4.mockResolvedValue(["172.31.255.255"] as any);

      const result = await validateWebhookUrl("http://internal.corp/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("172.31.255.255");
    });

    it("rejects 192.168.0.0/16 range", async () => {
      mockResolve4.mockResolvedValue(["192.168.1.1"] as any);

      const result = await validateWebhookUrl("http://home-router/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("192.168.1.1");
    });

    it("rejects 169.254.0.0/16 link-local range", async () => {
      mockResolve4.mockResolvedValue(["169.254.1.1"] as any);

      const result = await validateWebhookUrl("http://link-local/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("169.254.1.1");
    });

    it("rejects AWS metadata endpoint (169.254.169.254)", async () => {
      mockResolve4.mockResolvedValue(["169.254.169.254"] as any);

      const result = await validateWebhookUrl("http://metadata/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("AWS metadata endpoint");
    });

    it("accepts public IP addresses", async () => {
      mockResolve4.mockResolvedValue(["8.8.8.8"] as any);

      const result = await validateWebhookUrl("https://example.com/hook");

      expect(result.valid).toBe(true);
    });
  });

  describe("IPv6 private range detection", () => {
    it("rejects IPv6 loopback (::1)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENODATA"));
      mockResolve6.mockResolvedValue(["::1"] as any);

      const result = await validateWebhookUrl("http://localhost/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("::1");
    });

    it("rejects IPv6 unique local (fc00::/7)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENODATA"));
      mockResolve6.mockResolvedValue(["fc00::1"] as any);

      const result = await validateWebhookUrl("http://internal/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("fc00::1");
    });

    it("rejects IPv6 unique local (fd00::/8 range)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENODATA"));
      mockResolve6.mockResolvedValue(["fd00::1"] as any);

      const result = await validateWebhookUrl("http://internal/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("fd00::1");
    });

    it("rejects IPv6 link-local (fe80::/10)", async () => {
      mockResolve4.mockRejectedValue(new Error("ENODATA"));
      mockResolve6.mockResolvedValue(["fe80::1"] as any);

      const result = await validateWebhookUrl("http://link-local/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("fe80::1");
    });

    it("accepts public IPv6 addresses", async () => {
      mockResolve4.mockRejectedValue(new Error("ENODATA"));
      mockResolve6.mockResolvedValue(["2001:4860:4860::8888"] as any);

      const result = await validateWebhookUrl("https://example.com/hook");

      expect(result.valid).toBe(true);
    });
  });

  describe("DNS resolution handling", () => {
    it("rejects URLs that fail DNS resolution", async () => {
      mockResolve4.mockRejectedValue(new Error("ENOTFOUND"));
      mockResolve6.mockRejectedValue(new Error("ENOTFOUND"));

      const result = await validateWebhookUrl("http://nonexistent-domain-12345.test/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("DNS resolution failed");
    });

    it("rejects URLs that resolve to no addresses", async () => {
      mockResolve4.mockResolvedValue([] as any);
      mockResolve6.mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl("http://example.com/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("No addresses resolved");
    });

    it("handles multiple resolved addresses, rejecting if any is private", async () => {
      mockResolve4.mockResolvedValue(["8.8.8.8", "192.168.1.1"] as any);
      mockResolve6.mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl("http://dual-ip/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("192.168.1.1");
    });

    it("accepts URLs that resolve to only public addresses", async () => {
      mockResolve4.mockResolvedValue(["8.8.8.8"] as any);
      mockResolve6.mockResolvedValue(["2001:4860:4860::8888"] as any);

      const result = await validateWebhookUrl("https://example.com/hook");

      expect(result.valid).toBe(true);
    });
  });

  describe("URL parsing", () => {
    it("rejects invalid URLs", async () => {
      const result = await validateWebhookUrl("not-a-valid-url");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("URL validation error");
    });

    it("extracts hostname from URLs with paths", async () => {
      mockResolve4.mockResolvedValue(["8.8.8.8"] as any);

      const result = await validateWebhookUrl("https://example.com/deep/path/to/webhook");

      expect(result.valid).toBe(true);
      expect(mockResolve4).toHaveBeenCalledWith("example.com");
    });

    it("extracts hostname from URLs with ports", async () => {
      mockResolve4.mockResolvedValue(["8.8.8.8"] as any);

      const result = await validateWebhookUrl("https://example.com:8443/hook");

      expect(result.valid).toBe(true);
      expect(mockResolve4).toHaveBeenCalledWith("example.com");
    });
  });

  describe("DNS rebinding detection", () => {
    it("detects DNS rebinding from public to private during delivery", async () => {
      mockResolve4.mockResolvedValueOnce(["8.8.8.8"] as any);

      await validateWebhookUrl("https://example.com/hook");

      mockResolve4.mockClear();
      mockResolve6.mockClear();
      mockResolve4.mockResolvedValueOnce(["192.168.1.1"] as any);

      const result = await validateWebhookUrl("https://example.com/hook");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("192.168.1.1");
    });
  });
});
