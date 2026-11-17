import { createDocumentSchema, type DealScope } from "@agency/contracts";
import { createDealQueries } from "../../src/modules/deals/index.js";
import { createDocumentCommands } from "../../src/modules/documents/index.js";
import { createSamplePdf, ids, PDF_MIME } from "../fixtures/index.js";
import { openDatabase } from "./helpers.js";

const db = openDatabase();
const deals = createDealQueries({
  database: db,
  listDocumentMetadata: () => Promise.resolve([]),
});
const commands = createDocumentCommands({
  database: db,
  getAccessibleDealScope: (userId: string, dealId: string) =>
    deals.getAccessibleDealScope(userId, dealId),
});
const created: string[] = [];
let pdf: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  pdf = await createSamplePdf("integrity test");
});
afterAll(async () => {
  // Children first, then parents.
  await db.document.deleteMany({
    where: { id: { in: created }, parentDocumentId: { not: null } },
  });
  await db.document.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

const file = () => ({ bytes: pdf, fileName: "test.pdf", mimeType: PDF_MIME });
async function create(
  input: Record<string, unknown>,
  options: { userId?: string; dealId?: string } = {},
) {
  const metadata = await commands.createDocument(
    options.userId ?? ids.userAdmin,
    options.dealId ?? ids.dealNorthRental,
    createDocumentSchema.parse(input),
    file(),
  );
  created.push(metadata.id);
  return metadata;
}
const rentalCount = () =>
  db.document.count({ where: { dealId: ids.dealNorthRental } });

describe("document create invariants", () => {
  it("creates metadata + original atomically with the default status", async () => {
    const contract = await create({
      title: "Rental contract",
      type: "contract",
    });
    expect(contract).toMatchObject({
      deal_id: ids.dealNorthRental,
      type: "contract",
      status: "unknown",
      parent_document_id: null,
      mime_type: PDF_MIME,
    });
    const stored = await db.document.findUniqueOrThrow({
      where: { id: contract.id },
      select: { fileData: true },
    });
    expect(Buffer.from(stored.fileData).equals(Buffer.from(pdf))).toBe(true);
  });

  it("links an amendment to a same-deal contract and allows an unlinked amendment", async () => {
    const contract = await create({ title: "Contract", type: "contract" });
    const linked = await create({
      title: "Amendment",
      type: "amendment",
      parent_document_id: contract.id,
    });
    expect(linked.parent_document_id).toBe(contract.id);
    const unlinked = await create({
      title: "Amendment without contract",
      type: "amendment",
    });
    expect(unlinked.parent_document_id).toBeNull();
  });

  it.each([
    ["a parent from another deal", () => ids.docSouthContract, "amendment"],
    ["a non-contract parent", () => ids.docNorthAmendment, "amendment"],
    ["a parent on a contract", () => ids.docNorthContract, "contract"],
    [
      "a nonexistent parent",
      () => "99999999-9999-4999-8999-999999999999",
      "amendment",
    ],
  ])("rejects %s with 400 and writes nothing", async (_label, parent, type) => {
    const before = await db.document.count();
    await expect(
      commands.createDocument(
        ids.userAdmin,
        ids.dealNorthSale,
        createDocumentSchema.parse({
          title: "x",
          type,
          parent_document_id: parent(),
        }),
        file(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(await db.document.count()).toBe(before);
  });

  it("returns 403 for a member and 404 for foreign or missing deals, without writing", async () => {
    const before = await rentalCount();
    const input = createDocumentSchema.parse({ title: "x", type: "other" });
    await expect(
      commands.createDocument(
        ids.userMember,
        ids.dealNorthRental,
        input,
        file(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      commands.createDocument(
        ids.userOther,
        ids.dealNorthRental,
        input,
        file(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      commands.createDocument(
        ids.userAdmin,
        "99999999-9999-4999-8999-999999999999",
        input,
        file(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await rentalCount()).toBe(before);
  });

  it("exposes an authorization preflight with the same 404/403 semantics", async () => {
    await expect(
      commands.authorizeDealWrite(ids.userAdmin, ids.dealNorthRental),
    ).resolves.toMatchObject<Partial<DealScope>>({ role: "admin" });
    await expect(
      commands.authorizeDealWrite(ids.userMember, ids.dealNorthRental),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      commands.authorizeDealWrite(ids.userOther, ids.dealNorthRental),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("document update invariants", () => {
  it("keeps omitted fields, clears null fields, and never changes type/deal/bytes", async () => {
    const contract = await create({
      title: "Original",
      type: "contract",
      document_number: "N-1",
      document_date: "2026-01-10",
      effective_from: "2026-02-01",
      status: "signed",
    });
    const unchanged = await commands.updateDocument(
      ids.userAdmin,
      contract.id,
      {},
    );
    expect(unchanged).toEqual(contract);
    const updated = await commands.updateDocument(ids.userAdmin, contract.id, {
      document_number: null,
      effective_from: null,
    });
    expect(updated).toEqual({
      ...contract,
      document_number: null,
      effective_from: null,
    });
    const stored = await db.document.findUniqueOrThrow({
      where: { id: contract.id },
      select: { fileData: true, type: true, dealId: true },
    });
    expect(stored.type).toBe("contract");
    expect(stored.dealId).toBe(ids.dealNorthRental);
    expect(Buffer.from(stored.fileData).equals(Buffer.from(pdf))).toBe(true);
  });

  it("rejects self links, wrong-deal relinks, and parents on non-amendments while preserving the old parent", async () => {
    const contract = await create({ title: "Contract", type: "contract" });
    const amendment = await create({
      title: "Amendment",
      type: "amendment",
      parent_document_id: contract.id,
    });
    for (const parent of [
      amendment.id,
      ids.docSouthContract,
      ids.docNorthContract,
    ])
      await expect(
        commands.updateDocument(ids.userAdmin, amendment.id, {
          parent_document_id: parent,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      commands.updateDocument(ids.userAdmin, contract.id, {
        parent_document_id: contract.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(
      (
        await db.document.findUniqueOrThrow({
          where: { id: amendment.id },
          select: { parentDocumentId: true },
        })
      ).parentDocumentId,
    ).toBe(contract.id);
    const unlinked = await commands.updateDocument(
      ids.userAdmin,
      amendment.id,
      {
        parent_document_id: null,
      },
    );
    expect(unlinked.parent_document_id).toBeNull();
  });

  it("returns 404 for foreign/missing documents before 403 for members", async () => {
    await expect(
      commands.updateDocument(ids.userMember, ids.docSouthContract, {
        title: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      commands.updateDocument(
        ids.userAdmin,
        "99999999-9999-4999-8999-999999999999",
        { title: "x" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      commands.updateDocument(ids.userMember, ids.docNorthContract, {
        title: "x",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("document delete invariants", () => {
  it("maps the RESTRICT constraint to 409 and deletes in dependency order", async () => {
    const contract = await create({ title: "Contract", type: "contract" });
    const amendment = await create({
      title: "Amendment",
      type: "amendment",
      parent_document_id: contract.id,
    });
    await expect(
      commands.deleteDocument(ids.userAdmin, contract.id),
    ).rejects.toMatchObject({ statusCode: 409, code: "DOCUMENT_REFERENCED" });
    await commands.deleteDocument(ids.userAdmin, amendment.id);
    await expect(
      commands.readDocumentFile(ids.userAdmin, amendment.id),
    ).rejects.toMatchObject({ statusCode: 404 });
    await commands.deleteDocument(ids.userAdmin, contract.id);
    expect(await db.document.count({ where: { id: contract.id } })).toBe(0);
  });

  it("returns 403 for members and 404 for foreign or already deleted documents", async () => {
    await expect(
      commands.deleteDocument(ids.userMember, ids.docNorthAmendment),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      commands.deleteDocument(ids.userAdmin, ids.docSouthContract),
    ).rejects.toMatchObject({ statusCode: 404 });
    const doc = await create({ title: "To be deleted", type: "other" });
    await commands.deleteDocument(ids.userAdmin, doc.id);
    await expect(
      commands.deleteDocument(ids.userAdmin, doc.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("document file read", () => {
  it("returns the original bytes to a member of the team and 404 to others", async () => {
    const file = await commands.readDocumentFile(
      ids.userMember,
      ids.docNorthContract,
    );
    expect(file.mimeType).toBe(PDF_MIME);
    expect(file.fileName).toBe("Purchase agreement.pdf");
    expect(Buffer.from(file.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    await expect(
      commands.readDocumentFile(ids.userOther, ids.docNorthContract),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
