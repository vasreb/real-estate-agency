import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { loadDealForPage, loadDealsForPage, ServerApiError } =
  await import("./server");

const dealId = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  cookieJar.clear();
  cookieJar.set("agency_session", "token-value");
  cookieJar.set("other_cookie", "must-not-forward");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:3999");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );

describe("server gates", () => {
  it("fetches the internal API uncached, forwarding only the session cookie", async () => {
    respond(200, { items: [] });
    await expect(loadDealsForPage()).resolves.toEqual({ items: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:3999/api/deals");
    expect(init?.cache).toBe("no-store");
    expect(init?.headers).toEqual({
      cookie: "agency_session=token-value",
      accept: "application/json",
    });
  });

  it("redirects to /login without a cookie (no request) and on 401", async () => {
    cookieJar.delete("agency_session");
    await expect(loadDealsForPage()).rejects.toThrow("REDIRECT:/login");
    expect(fetchMock).not.toHaveBeenCalled();
    cookieJar.set("agency_session", "expired");
    respond(401, { code: "UNAUTHENTICATED", message: "x" });
    await expect(loadDealForPage(dealId)).rejects.toThrow("REDIRECT:/login");
  });

  it("maps invalid ids (without a request), 400 and 404 to notFound", async () => {
    await expect(loadDealForPage("../etc")).rejects.toThrow("NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
    respond(404, { code: "NOT_FOUND", message: "x" });
    await expect(loadDealForPage(dealId)).rejects.toThrow("NOT_FOUND");
    respond(400, { code: "VALIDATION_ERROR", message: "x" });
    await expect(loadDealForPage(dealId)).rejects.toThrow("NOT_FOUND");
  });

  it("surfaces server failures instead of rendering empty data", async () => {
    respond(500, { code: "INTERNAL_ERROR", message: "x" });
    await expect(loadDealsForPage()).rejects.toBeInstanceOf(ServerApiError);
  });

  it("rejects responses that do not match the contract", async () => {
    respond(200, { items: [{ id: "x", file_data: "secret" }] });
    await expect(loadDealsForPage()).rejects.toThrow();
  });
});
