/**
 * Team documents administration, citation preview and the assistant screens
 * against production builds and the compiled API. The model and embedding keys
 * are not configured here, so the chat itself is exercised only up to the
 * "assistant is unavailable" path; answers are covered by API integration tests.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  accounts,
  ids,
  loginViaUi,
  minimalPdf,
  originHeader,
  sha256,
} from "./support";

test.describe.configure({ mode: "serial" });

// One browser context per user and a single sign-in each: the login rate limit
// is per account, and the other specs of this suite share it.
let adminContext: BrowserContext;
let admin: Page;
test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext();
  admin = await adminContext.newPage();
  await loginViaUi(admin, accounts.admin);
});
test.afterAll(async () => {
  await adminContext.close();
});

const teamNorth = "10000000-0000-4000-8000-000000000001";
const teamSouth = "10000000-0000-4000-8000-000000000002";
const title = "E2E market report Q4";

test("an administrator uploads, views, downloads and deletes a team document", async () => {
  const page = admin;
  await page.getByRole("link", { name: "Documents" }).click();
  await page.waitForURL("**/admin/documents");
  const table = page.getByRole("table", { name: "Team documents" });
  // Deal documents of the team are listed with their index status (no worker
  // runs in this environment, so they are still waiting).
  await expect(table.getByText("Waiting").first()).toBeVisible();
  await expect(table.getByRole("link", { name: "Deal" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const form = page.getByRole("form", {
    name: "Upload to the team collection",
  });
  await form.getByRole("button", { name: "Upload" }).click();
  await expect(form.getByText("Enter a title")).toBeVisible();
  await expect(form.getByText("Select a file")).toBeVisible();

  const pdf = minimalPdf();
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/File/).setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await form.getByRole("button", { name: "Upload" }).click();

  const row = table.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Team collection");
  await expect(row).toContainText("Waiting");
  // Queued for indexing: it cannot be queued twice.
  await expect(
    row.getByRole("button", { name: `Reindex: ${title}` }),
  ).toBeDisabled();

  const view = row.getByRole("link", { name: "View" });
  const href = (await view.getAttribute("href"))!;
  const preview = await page.request.get(href);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toBe("application/pdf");
  expect(preview.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(sha256(await preview.body())).toBe(sha256(pdf));
  const file = await page.request.get(
    (await row.getByRole("link", { name: "Download" }).getAttribute("href"))!,
  );
  expect(file.headers()["content-disposition"]).toMatch(/^attachment;/);

  // Deletion needs confirmation; the original is gone afterwards.
  await row.getByRole("button", { name: `Delete: ${title}` }).click();
  await page.getByRole("button", { name: "Delete document" }).click();
  await expect(table.getByRole("row").filter({ hasText: title })).toHaveCount(
    0,
  );
  expect((await page.request.get(href)).status()).toBe(404);
});

test("team documents stay inside the team and need the administrator role", async ({
  browser,
}) => {
  const asAdmin = admin;
  const asMember = await (await browser.newContext()).newPage();
  const asOther = await (await browser.newContext()).newPage();
  await loginViaUi(asMember, accounts.member);
  await loginViaUi(asOther, accounts.other);

  // Created through the API; earlier specs may have deleted the seeded files.
  const created = await asAdmin.request.post(
    `/api/teams/${teamNorth}/documents`,
    {
      headers: originHeader(),
      multipart: {
        title: "E2E member-visible report",
        type: "other",
        file: {
          name: "r.pdf",
          mimeType: "application/pdf",
          buffer: minimalPdf(),
        },
      },
    },
  );
  expect(created.status()).toBe(201);
  const documentId = ((await created.json()) as { id: string }).id;

  await asMember.goto("/admin/documents");
  await expect(
    asMember.getByText("You are not an administrator of any team"),
  ).toBeVisible();
  expect(
    (await asMember.request.get(`/api/teams/${teamNorth}/documents`)).status(),
  ).toBe(403);
  expect(
    (await asMember.request.get(`/api/teams/${teamSouth}/documents`)).status(),
  ).toBe(404);
  expect(
    (
      await asMember.request.post(`/api/documents/${documentId}/reindex`, {
        headers: originHeader(),
      })
    ).status(),
  ).toBe(403);
  // A member may open the preview of an own-team document, not another team.
  expect(
    (
      await asMember.request.get(`/api/documents/${documentId}/preview`)
    ).status(),
  ).toBe(200);
  for (const path of ["preview", "file"])
    expect(
      (
        await asOther.request.get(`/api/documents/${documentId}/${path}`)
      ).status(),
    ).toBe(404);

  const removed = await asAdmin.request.delete(`/api/documents/${documentId}`, {
    headers: originHeader(),
  });
  expect(removed.status()).toBe(204);
});

test("the assistant opens as a side panel and as a full page", async () => {
  const page = admin;
  await page.goto("/deals");
  await page.getByRole("button", { name: "Assistant" }).click();
  const panel = page.getByRole("complementary", { name: "Assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Team")).toHaveValue(teamNorth);
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();

  // On a deal page the panel still covers the whole team: no deal selector.
  await page.goto(`/deals/${ids.dealNorthSale}`);
  await page.getByRole("button", { name: "Assistant" }).click();
  const dealPanel = page.getByRole("complementary", { name: "Assistant" });
  await expect(dealPanel.getByLabel("Team")).toHaveValue(teamNorth);
  await expect(dealPanel.getByLabel("Deal")).toHaveCount(0);

  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  // The widget is not shown next to the full chat.
  await expect(page.getByRole("button", { name: "Assistant" })).toHaveCount(0);
  await expect(page.getByLabel("Deal")).toHaveCount(0);
  const teamOptions = await page
    .getByLabel("Team")
    .locator("option")
    .allTextContents();
  expect(teamOptions.join(" ")).not.toContain("Team South");
  await page.getByRole("textbox", { name: "Your question" }).fill("Hello?");
  await page.getByRole("button", { name: "Send" }).click();
  // No model keys in this environment: a readable error, not a hang.
  await expect(page.locator(".chat-assistant[role=alert]")).toBeVisible();
});
