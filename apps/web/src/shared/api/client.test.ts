import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, documentFileUrl } from "./client";
import { ApiError, errorMessage } from "./errors";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type Recorded = {
  url: string;
  method: string;
  credentials: RequestCredentials | undefined;
  body: () => Promise<unknown>;
  form?: FormData;
};

function recordingFetch(response: () => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const copy = input.clone();
      calls.push({
        url: copy.url,
        method: copy.method,
        credentials: copy.credentials,
        body: () => copy.json(),
      });
    } else {
      calls.push({
        url: new URL(String(input), "http://localhost:3000").href,
        method: init?.method ?? "GET",
        credentials: init?.credentials,
        body: () => Promise.resolve(init?.body),
        form: init?.body instanceof FormData ? init.body : undefined,
      });
    }
    return Promise.resolve(response());
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("browser API client", () => {
  it("uses relative same-origin URLs with credentials and the typed login body", async () => {
    const { calls, fetchImpl } = recordingFetch(() => json(204));
    await createApiClient(fetchImpl).login({
      email: "a@agency.test",
      password: " secret ",
    });
    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    expect(new URL(request.url).pathname).toBe("/api/auth/login");
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("same-origin");
    expect(await request.body()).toEqual({
      email: "a@agency.test",
      password: " secret ",
    });
  });

  it("returns typed data for deal reads", async () => {
    const { calls, fetchImpl } = recordingFetch(() => json(200, { items: [] }));
    const client = createApiClient(fetchImpl);
    await expect(client.listDeals()).resolves.toEqual({ items: [] });
    await client.getDeal("11111111-1111-4111-8111-111111111111");
    expect(new URL(calls[1]!.url).pathname).toBe(
      "/api/deals/11111111-1111-4111-8111-111111111111",
    );
  });

  it.each([
    [401, { code: "UNAUTHENTICATED", message: "x" }, "UNAUTHENTICATED"],
    [409, { code: "DOCUMENT_REFERENCED", message: "x" }, "DOCUMENT_REFERENCED"],
    [502, "<html>bad gateway</html>", "INTERNAL_ERROR"],
  ])("maps HTTP %i to an explicit ApiError", async (status, body, code) => {
    const { fetchImpl } = recordingFetch(() =>
      typeof body === "string"
        ? new Response(body, { status })
        : json(status, body),
    );
    const error = await createApiClient(fetchImpl)
      .listDeals()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code });
  });

  it("maps a rejected fetch to NETWORK_ERROR without leaking details", async () => {
    const client = createApiClient(() =>
      Promise.reject(new TypeError("secret host 10.0.0.1")),
    );
    const error = await client.listDeals().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    expect(errorMessage(error)).not.toContain("10.0.0.1");
  });

  it("uploads multipart fields without empty optional values", async () => {
    const { calls, fetchImpl } = recordingFetch(() => json(201, { id: "x" }));
    await createApiClient(fetchImpl).uploadDocument(
      "deal-1",
      { title: "Contract", type: "contract", status: "draft" },
      new File(["%PDF-"], "Contract.pdf", { type: "application/pdf" }),
    );
    const form = calls[0]!.form!;
    expect([...form.keys()]).toEqual(["title", "type", "status", "file"]);
    expect((form.get("file") as File).name).toBe("Contract.pdf");
    expect(calls[0]!.credentials).toBe("same-origin");
  });

  it("builds same-origin download URLs", () => {
    expect(documentFileUrl("a/b")).toBe("/api/documents/a%2Fb/file");
  });

  it("keeps internal API settings and storage out of client modules", async () => {
    for (const file of [
      "client.ts",
      "errors.ts",
      "query.ts",
      "context.tsx",
      "index.ts",
    ]) {
      const source = await readFile(
        path.join(process.cwd(), "src/shared/api", file),
        "utf8",
      );
      expect(source).not.toMatch(
        /API_INTERNAL_URL|localStorage|sessionStorage|\.\/server/,
      );
    }
  });
});
