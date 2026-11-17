import { randomUUID } from "node:crypto";
import { dealListSchema } from "@agency/contracts";
import { hashPassword } from "../../src/modules/auth/index.js";
import { ids } from "../fixtures/index.js";
import { accounts, createTestApp, login, openDatabase } from "./helpers.js";

const db = openDatabase();
const app = createTestApp(db);
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function listAs(cookie?: string) {
  return app.inject({
    url: "/api/deals",
    headers: cookie ? { cookie } : {},
  });
}

describe("GET /api/deals", () => {
  it("requires a session", async () => {
    const response = await listAs();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("returns only first-team deals with exactly the contract fields", async () => {
    for (const account of [accounts.admin, accounts.member]) {
      const response = await listAs(await login(app, account));
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const body = dealListSchema.parse(response.json());
      expect(body.items.map((item) => item.id).sort()).toEqual(
        [ids.dealNorthSale, ids.dealNorthRental].sort(),
      );
      expect(body.items.find((item) => item.id === ids.dealNorthSale)).toEqual({
        id: ids.dealNorthSale,
        number: "2026-001",
        type: "sale",
        client_name: "Romashka LLC",
        property_address: "Moscow, Tverskaya St., 1, apt. 10",
        team_name: "Team North",
      });
      expect(response.body).not.toContain("file_data");
    }
  });

  it("omits foreign-team deals and shows both teams for a multi-team user", async () => {
    const other = dealListSchema.parse(
      (await listAs(await login(app, accounts.other))).json(),
    );
    expect(other.items.map((item) => item.id)).toEqual([ids.dealSouthSale]);
    const multi = dealListSchema.parse(
      (await listAs(await login(app, accounts.multi))).json(),
    );
    expect(multi.items).toHaveLength(3);
  });

  it("returns an empty list for a user without teams", async () => {
    const email = `empty-${randomUUID()}@agency.test`;
    const password = "empty-user-password";
    const user = await db.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    try {
      const response = await listAs(await login(app, { email, password }));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [] });
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it("reflects membership removal and re-adding without a new login", async () => {
    const cookie = await login(app, accounts.multi);
    const key = {
      teamId_userId: { teamId: ids.teamSouth, userId: ids.userMulti },
    };
    try {
      await db.teamMember.delete({ where: key });
      const after = dealListSchema.parse((await listAs(cookie)).json());
      expect(after.items.map((item) => item.id)).not.toContain(
        ids.dealSouthSale,
      );
      expect(after.items).toHaveLength(2);
    } finally {
      await db.teamMember.upsert({
        where: key,
        create: { teamId: ids.teamSouth, userId: ids.userMulti, role: "admin" },
        update: { role: "admin" },
      });
    }
    const restored = dealListSchema.parse((await listAs(cookie)).json());
    expect(restored.items).toHaveLength(3);
  });
});
