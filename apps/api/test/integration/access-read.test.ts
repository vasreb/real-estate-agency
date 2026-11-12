import { randomUUID } from "node:crypto";
import { dealDetailSchema, dealListSchema } from "@agency/contracts";
import { createApp } from "../../src/app.js";
import { ids } from "../fixtures/index.js";
import {
  accounts,
  login,
  openDatabase,
  ORIGIN,
  testConfig,
} from "./helpers.js";

const db = openDatabase();
let logs = "";
const app = createApp(testConfig({ LOG_LEVEL: "trace" }), {
  database: db,
  logDestination: {
    write: (chunk: string) => {
      logs += chunk;
    },
  },
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const get = (url: string, cookie?: string) =>
  app.inject({ url, headers: cookie ? { cookie } : {} });

type Account = keyof typeof accounts;
const north = [ids.dealNorthSale, ids.dealNorthRental];
const south = [ids.dealSouthSale];
const visible: Record<Account, string[]> = {
  admin: north,
  member: north,
  other: south,
  multi: [...north, ...south],
};
const roles: Record<Account, Record<string, "admin" | "member">> = {
  admin: { [ids.dealNorthSale]: "admin", [ids.dealNorthRental]: "admin" },
  member: { [ids.dealNorthSale]: "member", [ids.dealNorthRental]: "member" },
  other: { [ids.dealSouthSale]: "member" },
  multi: {
    [ids.dealNorthSale]: "member",
    [ids.dealNorthRental]: "member",
    [ids.dealSouthSale]: "admin",
  },
};
const allDeals = [...north, ...south];

describe("read access matrix", () => {
  it.each(Object.keys(accounts) as Account[])(
    "%s sees exactly the deals of current teams with the per-team role",
    async (name) => {
      const cookie = await login(app, accounts[name]);
      const list = dealListSchema.parse(
        (await get("/api/deals", cookie)).json(),
      );
      expect(list.items.map((item) => item.id).sort()).toEqual(
        [...visible[name]].sort(),
      );
      for (const dealId of allDeals) {
        const response = await get(`/api/deals/${dealId}`, cookie);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        if (visible[name].includes(dealId)) {
          expect(response.statusCode).toBe(200);
          expect(dealDetailSchema.parse(response.json()).role).toBe(
            roles[name][dealId],
          );
        } else {
          // Foreign records are 404 (never 403), indistinguishable from missing ones.
          expect(response.statusCode).toBe(404);
          expect(response.json()).toEqual(
            (await get(`/api/deals/${randomUUID()}`, cookie)).json(),
          );
        }
      }
    },
  );

  it.each([
    "/api/deals",
    `/api/deals/${ids.dealNorthSale}`,
    `/api/deals/${ids.dealSouthSale}`,
    `/api/deals/${randomUUID()}`,
    "/api/deals/not-a-uuid",
  ])(
    "checks authentication before the resource: anonymous %s → 401",
    async (url) => {
      for (const cookie of [
        undefined,
        "agency_session=",
        "agency_session=forged",
        `agency_session=${Buffer.alloc(32, 1).toString("base64url")}`,
      ]) {
        const response = await get(url, cookie);
        expect(response.statusCode).toBe(401);
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    },
  );
});

describe("live memberships after login", () => {
  const southKey = {
    teamId_userId: { teamId: ids.teamSouth, userId: ids.userMulti },
  };
  const restore = () =>
    db.teamMember.upsert({
      where: southKey,
      create: { teamId: ids.teamSouth, userId: ids.userMulti, role: "admin" },
      update: { role: "admin" },
    });

  it("applies a role downgrade on the next request", async () => {
    const cookie = await login(app, accounts.multi);
    try {
      await db.teamMember.update({ where: southKey, data: { role: "member" } });
      const detail = dealDetailSchema.parse(
        (await get(`/api/deals/${ids.dealSouthSale}`, cookie)).json(),
      );
      expect(detail.role).toBe("member");
    } finally {
      await restore();
    }
  });

  it("turns a removed team's deal into 404 and drops it from the list", async () => {
    const cookie = await login(app, accounts.multi);
    try {
      await db.teamMember.delete({ where: southKey });
      expect(
        (await get(`/api/deals/${ids.dealSouthSale}`, cookie)).statusCode,
      ).toBe(404);
      const list = dealListSchema.parse(
        (await get("/api/deals", cookie)).json(),
      );
      expect(list.items.map((item) => item.id)).not.toContain(
        ids.dealSouthSale,
      );
      expect(
        (await get(`/api/deals/${ids.dealNorthSale}`, cookie)).statusCode,
      ).toBe(200);
    } finally {
      await restore();
    }
  });
});

describe("logout and relogin", () => {
  it("invalidates only the logged-out session and issues a fresh token on relogin", async () => {
    const first = await login(app, accounts.member);
    const second = await login(app, accounts.member);
    expect(first).not.toBe(second);
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: ORIGIN, cookie: first },
    });
    expect(logout.statusCode).toBe(204);
    expect((await get("/api/deals", first)).statusCode).toBe(401);
    expect((await get("/api/deals", second)).statusCode).toBe(200);
    const relogin = await login(app, accounts.member);
    expect(relogin).not.toBe(first);
    expect((await get("/api/deals", relogin)).statusCode).toBe(200);
  });

  it("does not leak tokens or passwords into responses or logs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: ORIGIN },
      payload: accounts.admin,
    });
    const token = response.cookies.find(
      (c) => c.name === "agency_session",
    )!.value;
    expect(response.body).toBe("");
    const list = await get("/api/deals", `agency_session=${token}`);
    expect(list.body).not.toContain(token);
    expect(logs).toContain("Request completed");
    expect(logs).not.toContain(token);
    for (const account of Object.values(accounts))
      expect(logs).not.toContain(account.password);
  });
});
