import "server-only";
import {
  dealDetailSchema,
  dealListSchema,
  SESSION_COOKIE,
  uuidSchema,
  type DealDetail,
  type DealList,
} from "@agency/contracts";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

/** Server-only setting; never referenced by client modules. */
function internalApiOrigin(): string {
  return new URL(process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001")
    .origin;
}

export class ServerApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with ${status}`);
    this.name = "ServerApiError";
  }
}

/**
 * Uncached server fetch that forwards only the session cookie. Pages must
 * await it before producing output so redirect/notFound set the real status.
 */
async function serverGet(
  path: string,
): Promise<{ status: number; body: unknown }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const response = await fetch(`${internalApiOrigin()}${path}`, {
    cache: "no-store",
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      accept: "application/json",
    },
  });
  const body: unknown = response.ok ? await response.json() : null;
  return { status: response.status, body };
}

export async function loadDealsForPage(): Promise<DealList> {
  const { status, body } = await serverGet("/api/deals");
  if (status === 401) redirect("/login");
  if (status !== 200) throw new ServerApiError(status);
  return dealListSchema.parse(body);
}

export async function loadDealForPage(dealId: string): Promise<DealDetail> {
  if (!uuidSchema.safeParse(dealId).success) notFound();
  const { status, body } = await serverGet(
    `/api/deals/${encodeURIComponent(dealId)}`,
  );
  if (status === 401) redirect("/login");
  if (status === 404 || status === 400) notFound();
  if (status !== 200) throw new ServerApiError(status);
  return dealDetailSchema.parse(body);
}
