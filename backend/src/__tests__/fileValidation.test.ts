import { validateFileMimeType } from "../utils/fileValidation";
import fs from "fs";
import path from "path";
import os from "os";
import { Buffer } from "buffer";

describe("validateFileMimeType", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-validation-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createTestFile = (filename: string, magicBytes: number[]) => {
    const filePath = path.join(tempDir, filename);
    const buffer = Buffer.alloc(12);
    for (let i = 0; i < magicBytes.length; i++) {
      buffer[i] = magicBytes[i];
    }
    fs.writeFileSync(filePath, buffer);
    return filePath;
  };

  it("should recognize ZIP magic bytes (50 4B 03 04)", async () => {
    const filePath = createTestFile("test1.zip", [0x50, 0x4B, 0x03, 0x04]);
    const result = await validateFileMimeType(filePath);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/zip");
  });

  it("should recognize ZIP magic bytes (50 4B 05 06)", async () => {
    const filePath = createTestFile("test2.zip", [0x50, 0x4B, 0x05, 0x06]);
    const result = await validateFileMimeType(filePath);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/zip");
  });

  it("should recognize ZIP magic bytes (50 4B 07 08)", async () => {
    const filePath = createTestFile("test3.zip", [0x50, 0x4B, 0x07, 0x08]);
    const result = await validateFileMimeType(filePath);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/zip");
  });

  it("should reject invalid magic bytes", async () => {
    const filePath = createTestFile("invalid.zip", [0x00, 0x01, 0x02, 0x03]);
    const result = await validateFileMimeType(filePath);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Unsupported file type signature");
  });
});
