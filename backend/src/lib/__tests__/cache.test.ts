import { cache } from "../cache";

const connectMock = jest.fn();
const getMock = jest.fn();
const setexMock = jest.fn();
const isRedisConnectedMock = jest.fn();

jest.mock("../redis", () => ({
  __esModule: true,
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
    getInstance: () => ({
      get: (...args: unknown[]) => getMock(...args),
      setex: (...args: unknown[]) => setexMock(...args),
    }),
    isRedisConnected: () => isRedisConnectedMock(),
  },
}));

describe("cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isRedisConnectedMock.mockReturnValue(true);
  });

  it("calls fn exactly once and propagates its error, without retrying (issue #1757)", async () => {
    getMock.mockResolvedValue(null);
    const fnError = new Error("db query failed");
    const fn = jest.fn().mockRejectedValue(fnError);

    await expect(cache("key", 60, fn)).rejects.toThrow("db query failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to direct execution when Redis is down, calling fn once", async () => {
    isRedisConnectedMock.mockReturnValue(false);
    connectMock.mockRejectedValue(new Error("redis down"));
    const fn = jest.fn().mockResolvedValue("data");

    const result = await cache("key", 60, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: "data", hit: false });
  });

  it("returns cached data on a hit without calling fn", async () => {
    getMock.mockResolvedValue(JSON.stringify({ foo: "bar" }));
    const fn = jest.fn();

    const result = await cache("key", 60, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { foo: "bar" }, hit: true });
  });

  it("serves the fresh result even if the cache write fails", async () => {
    getMock.mockResolvedValue(null);
    setexMock.mockRejectedValue(new Error("redis set failed"));
    const fn = jest.fn().mockResolvedValue("fresh-data");

    const result = await cache("key", 60, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: "fresh-data", hit: false });
  });
});
