import { createHash } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";

/** Test-only accounts seeded into the isolated agency_test database. */
export const accounts = {
  admin: { email: "admin@agency.test", password: "test-admin-password-north" },
  member: {
    email: "member@agency.test",
    password: "test-member-password-north",
  },
  other: { email: "other@agency.test", password: "test-other-password-south" },
} as const;

export const ids = {
  dealNorthSale: "50000000-0000-4000-8000-000000000001",
  dealNorthRental: "50000000-0000-4000-8000-000000000002",
  dealSouthSale: "50000000-0000-4000-8000-000000000003",
  docNorthContract: "60000000-0000-4000-8000-000000000001",
  docNorthAmendment: "60000000-0000-4000-8000-000000000002",
  docSouthContract: "60000000-0000-4000-8000-000000000003",
} as const;

/**
 * Minimal structurally valid one-page PDF with a correct xref table, built at
 * run time so tests never depend on seeded rows that other specs delete.
 */
export function minimalPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
  ];
  let body = "%PDF-1.7\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export const sha256 = (bytes: Buffer | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export async function loginViaUi(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Пароль").fill(account.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/deals");
  await expect(page.getByRole("heading", { name: "Сделки" })).toBeVisible();
}

export async function logoutViaUi(page: Page) {
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL("**/login");
}

export const originHeader = () => ({
  origin: new URL(process.env.E2E_BASE_URL!).origin,
});

/** The documents-table row whose title cell matches exactly. */
export function documentRow(page: Page, title: string): Locator {
  return page
    .getByRole("table", { name: "Документы сделки" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: title, exact: true }) });
}
