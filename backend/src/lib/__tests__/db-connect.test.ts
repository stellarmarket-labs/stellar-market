import { connectWithRetry } from "../db-connect";

describe("connectWithRetry", () => {
  it("still attempts a connection when retries is 0", async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const prisma = { $connect: connect } as unknown as { $connect: () => Promise<void> };

    await connectWithRetry(prisma as never, 0, 0);

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("throws if the single attempt fails when retries is 0", async () => {
    const err = new Error("db down");
    const connect = jest.fn().mockRejectedValue(err);
    const prisma = { $connect: connect } as unknown as { $connect: () => Promise<void> };

    await expect(connectWithRetry(prisma as never, 0, 0)).rejects.toThrow("db down");
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("retries up to the given count before throwing", async () => {
    const err = new Error("db down");
    const connect = jest.fn().mockRejectedValue(err);
    const prisma = { $connect: connect } as unknown as { $connect: () => Promise<void> };

    await expect(connectWithRetry(prisma as never, 3, 0)).rejects.toThrow("db down");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("resolves once $connect succeeds within the retry budget", async () => {
    const connect = jest
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(undefined);
    const prisma = { $connect: connect } as unknown as { $connect: () => Promise<void> };

    await connectWithRetry(prisma as never, 3, 0);

    expect(connect).toHaveBeenCalledTimes(2);
  });
});
