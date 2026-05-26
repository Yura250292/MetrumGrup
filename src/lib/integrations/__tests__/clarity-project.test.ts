import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { lookupEdrpou } from "../clarity-project";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown) {
  const fn = jest.fn<typeof fetch>().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("clarity-project lookupEdrpou", () => {
  beforeEach(() => {
    process.env.CLARITY_PROJECT_API_KEY = "test-key";
    delete process.env.OPENDATABOT_API_KEY;
  });

  it("rejects invalid EDRPOU before HTTP call", async () => {
    const fetchFn = mockFetchOnce(200, {});
    const result = await lookupEdrpou("12345");
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("parses ACTIVE status from clarity-project", async () => {
    mockFetchOnce(200, {
      name: "ТОВ Тест",
      status: "Зареєстровано",
      address: "Київ, вул. Хрещатик 1",
    });
    const result = await lookupEdrpou("14360570");
    expect(result).not.toBeNull();
    expect(result?.taxStatus).toBe("ACTIVE");
    expect(result?.legalForm).toBe("TOV");
    expect(result?.source).toBe("clarity-project");
  });

  it("maps LIQUIDATED status", async () => {
    mockFetchOnce(200, { name: "ТОВ Зомбі", status: "Припинено" });
    const result = await lookupEdrpou("14360570");
    expect(result?.taxStatus).toBe("LIQUIDATED");
  });

  it("returns null on http 500 without fallback", async () => {
    mockFetchOnce(500, {});
    const result = await lookupEdrpou("14360570");
    expect(result).toBeNull();
  });

  it("returns null when no API key configured and no fallback key", async () => {
    delete process.env.CLARITY_PROJECT_API_KEY;
    const fetchFn = jest.fn();
    global.fetch = fetchFn as unknown as typeof fetch;
    const result = await lookupEdrpou("14360570");
    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
