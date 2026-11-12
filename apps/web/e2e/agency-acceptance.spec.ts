/**
 * The five acceptance clauses of docs/agency-base-spec.md against production
 * builds, the compiled Fastify API and PostgreSQL. No API mocks.
 */
import { expect, test } from "@playwright/test";
import {
  accounts,
  documentRow,
  ids,
  loginViaUi,
  logoutViaUi,
  originHeader,
  sha256,
} from "./support";

test.describe.configure({ mode: "serial" });

test("1. test data: two teams with different deals, admin+member of team one, member of team two, contract and amendment", async ({
  page,
}) => {
  await loginViaUi(page, accounts.admin);
  const rows = page
    .getByRole("table", { name: "Доступные сделки" })
    .getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByRole("cell", { name: "Команда «Север»" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "2026-001" }).click();
  await page.waitForURL(`**/deals/${ids.dealNorthSale}`);
  await expect(documentRow(page, "Договор купли-продажи")).toContainText(
    "Договор",
  );
  await expect(
    documentRow(page, "Дополнительное соглашение № 1"),
  ).toContainText("Договор купли-продажи (№ ДКП-2026-001)");
  await expect(page.getByRole("button", { name: "Загрузить" })).toBeVisible();
  await logoutViaUi(page);
  await loginViaUi(page, accounts.member);
  await expect(page.getByRole("cell", { name: "Команда «Север»" })).toHaveCount(
    2,
  );
  await logoutViaUi(page);
  await loginViaUi(page, accounts.other);
  await expect(page.getByRole("cell", { name: "Команда «Юг»" })).toHaveCount(1);
});

test("2. each user sees only own-team deals; foreign deal URL and foreign document API are 404", async ({
  page,
}) => {
  await loginViaUi(page, accounts.member);
  const table = page.getByRole("table", { name: "Доступные сделки" });
  await expect(table).not.toContainText("Команда «Юг»");
  const navigation = await page.goto(`/deals/${ids.dealSouthSale}`);
  expect(navigation?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Запись не найдена" }),
  ).toBeVisible();
  const html = await page.request.get(`/deals/${ids.dealSouthSale}`, {
    headers: { accept: "text/html" },
  });
  expect(html.status()).toBe(404);
  expect(await html.text()).not.toContain("Иванова");
  for (const url of [
    `/api/deals/${ids.dealSouthSale}`,
    `/api/documents/${ids.docSouthContract}/file`,
  ]) {
    const response = await page.request.get(url);
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  }
  const patch = await page.request.patch(
    `/api/documents/${ids.docSouthContract}`,
    {
      headers: originHeader(),
      data: { title: "x" },
    },
  );
  expect(patch.status()).toBe(404);
});

test("3. a member downloads an own-team file; changing a document through the API is 403", async ({
  page,
}) => {
  await loginViaUi(page, accounts.member);
  await page.goto(`/deals/${ids.dealNorthSale}`);
  await expect(
    page.getByRole("button", { name: /Редактировать|Удалить|Загрузить/ }),
  ).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Скачать: Договор купли-продажи" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Договор купли-продажи.pdf");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const direct = await page.request.get(
    `/api/documents/${ids.docNorthContract}/file`,
  );
  expect(sha256(await direct.body())).toBe(sha256(bytes));
  // A hidden button is not proof: call the API with the real cookie and Origin.
  const patch = await page.request.patch(
    `/api/documents/${ids.docNorthContract}`,
    {
      headers: originHeader(),
      data: { title: "Изменено сотрудником" },
    },
  );
  expect(patch.status()).toBe(403);
  const remove = await page.request.delete(
    `/api/documents/${ids.docNorthAmendment}`,
    {
      headers: originHeader(),
    },
  );
  expect(remove.status()).toBe(403);
  const upload = await page.request.post(
    `/api/deals/${ids.dealNorthSale}/documents`,
    {
      headers: originHeader(),
      multipart: {
        title: "x",
        type: "other",
        file: { name: "x.pdf", mimeType: "application/pdf", buffer: bytes },
      },
    },
  );
  expect(upload.status()).toBe(403);
  const after = await page.request.get(`/api/deals/${ids.dealNorthSale}`);
  expect(JSON.stringify(await after.json())).not.toContain(
    "Изменено сотрудником",
  );
});

test("4. an admin uploads PDF and DOCX, links the amendment to a same-deal contract, downloads the original; a foreign contract link is rejected", async ({
  page,
}) => {
  await loginViaUi(page, accounts.admin);
  const pdf = await (
    await page.request.get(`/api/documents/${ids.docNorthContract}/file`)
  ).body();
  const docx = await (
    await page.request.get(`/api/documents/${ids.docNorthAmendment}/file`)
  ).body();
  await page.goto(`/deals/${ids.dealNorthRental}`);
  await expect(page.getByText("Документов пока нет")).toBeVisible();

  await page.getByRole("button", { name: "Загрузить" }).click();
  await page.getByLabel(/Файл/).setInputFiles({
    name: "Договор аренды.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByLabel("Название").fill("Договор аренды");
  await page.getByLabel("Номер").fill("ДА-7");
  await page.getByLabel("Дата документа").fill("2026-04-01");
  await page
    .getByRole("form", { name: "Загрузка документа" })
    .getByRole("button", { name: "Загрузить" })
    .click();
  await expect(documentRow(page, "Договор аренды")).toContainText("01.04.2026");

  await page.getByRole("button", { name: "Загрузить" }).click();
  await page.getByLabel(/Файл/).setInputFiles({
    name: "ДС к договору аренды.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx,
  });
  await page.getByLabel("Название").fill("ДС к договору аренды");
  await page.getByLabel("Тип").selectOption("amendment");
  await page
    .getByLabel("Связанный договор")
    .selectOption({ label: "Договор аренды (№ ДА-7)" });
  await page
    .getByRole("form", { name: "Загрузка документа" })
    .getByRole("button", { name: "Загрузить" })
    .click();
  const amendmentRow = documentRow(page, "ДС к договору аренды");
  await expect(amendmentRow).toContainText("Договор аренды (№ ДА-7)");

  const detail = (await (
    await page.request.get(`/api/deals/${ids.dealNorthRental}`)
  ).json()) as {
    documents: { id: string; title: string; mime_type: string }[];
  };
  const uploadedPdf = detail.documents.find(
    (d) => d.title === "Договор аренды",
  )!;
  const uploadedDocx = detail.documents.find(
    (d) => d.title === "ДС к договору аренды",
  )!;
  expect(uploadedPdf.mime_type).toBe("application/pdf");
  expect(uploadedDocx.mime_type).toBe(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Скачать: ДС к договору аренды" })
    .click();
  const { readFile } = await import("node:fs/promises");
  const downloaded = await readFile(await (await downloadPromise).path());
  expect(sha256(downloaded)).toBe(sha256(docx));
  expect(
    sha256(
      await (
        await page.request.get(`/api/documents/${uploadedPdf.id}/file`)
      ).body(),
    ),
  ).toBe(sha256(pdf));

  const foreign = await page.request.patch(
    `/api/documents/${uploadedDocx.id}`,
    {
      headers: originHeader(),
      data: { parent_document_id: ids.docSouthContract },
    },
  );
  expect(foreign.status()).toBe(400);
  const otherDeal = await page.request.patch(
    `/api/documents/${uploadedDocx.id}`,
    {
      headers: originHeader(),
      data: { parent_document_id: ids.docNorthContract },
    },
  );
  expect(otherDeal.status()).toBe(400);
  await page.reload();
  await expect(documentRow(page, "ДС к договору аренды")).toContainText(
    "Договор аренды (№ ДА-7)",
  );
});

test("5. a contract with a linked amendment cannot be deleted; after deleting the amendment its original is gone", async ({
  page,
}) => {
  await loginViaUi(page, accounts.admin);
  await page.goto(`/deals/${ids.dealNorthSale}`);
  await page
    .getByRole("button", { name: "Удалить: Договор купли-продажи" })
    .click();
  await page.getByRole("button", { name: "Удалить документ" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "привязаны допсоглашения",
  );
  await page.keyboard.press("Escape");
  const fileUrl = `/api/documents/${ids.docNorthAmendment}/file`;
  expect((await page.request.get(fileUrl)).status()).toBe(200);
  await page
    .getByRole("button", { name: "Удалить: Дополнительное соглашение № 1" })
    .click();
  await page.getByRole("button", { name: "Удалить документ" }).click();
  await expect(documentRow(page, "Дополнительное соглашение № 1")).toHaveCount(
    0,
  );
  expect((await page.request.get(fileUrl)).status()).toBe(404);
  await page
    .getByRole("button", { name: "Удалить: Договор купли-продажи" })
    .click();
  await page.getByRole("button", { name: "Удалить документ" }).click();
  await expect(page.getByText("Документов пока нет")).toBeVisible();
});

test("account switch in one browser context leaves no cached rows of the previous user", async ({
  page,
}) => {
  await loginViaUi(page, accounts.member);
  await expect(
    page.getByRole("table", { name: "Доступные сделки" }),
  ).toContainText("Команда «Север»");
  await logoutViaUi(page);
  await loginViaUi(page, accounts.other);
  const table = page.getByRole("table", { name: "Доступные сделки" });
  await expect(table).toContainText("Команда «Юг»");
  await expect(table).not.toContainText("Команда «Север»");
  await page.goBack();
  await page.goBack();
  await expect(page.locator("body")).not.toContainText("Команда «Север»");
});
