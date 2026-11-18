import {
  documentMetadataSchema,
  teamDocumentListSchema,
  teamDocumentSchema,
  teamListSchema,
} from "@agency/contracts";
import {
  createSampleDocx,
  createSamplePdf,
  DOCX_MIME,
  ids,
  PDF_MIME,
} from "../fixtures/index.js";
import {
  accounts,
  createTestApp,
  login,
  openDatabase,
  ORIGIN,
} from "./helpers.js";
import { multipart, type Part } from "./multipart.js";

const db = openDatabase();
const app = createTestApp(db);
let admin: string;
let member: string;
let other: string;
const pdf = await createSamplePdf("team collection report");
const docx = createSampleDocx("Team collection note");
const created: string[] = [];

beforeAll(async () => {
  admin = await login(app, accounts.admin);
  member = await login(app, accounts.member);
  other = await login(app, accounts.other);
});
afterAll(async () => {
  await db.document.deleteMany({ where: { id: { in: created } } });
  await app.close();
  await db.$disconnect();
});

const teamUrl = (teamId: string) => `/api/teams/${teamId}/documents`;
const fields = (extra: Part[] = []): Part[] => [
  { name: "title", value: "Market report Q4" },
  { name: "type", value: "other" },
  ...extra,
];
const filePart = (
  bytes: Uint8Array = pdf,
  fileName = "report.pdf",
  contentType = PDF_MIME,
): Part => ({ name: "file", fileName, contentType, bytes });

function uploadTeam(
  teamId: string,
  cookie: string,
  parts: Part[] = [...fields(), filePart()],
) {
  const body = multipart(parts);
  return app.inject({
    method: "POST",
    url: teamUrl(teamId),
    headers: {
      cookie,
      origin: ORIGIN,
      ...body.headers,
    },
    payload: body.payload,
  });
}

async function createTeamDocument(parts?: Part[]) {
  const response = await uploadTeam(ids.teamNorth, admin, parts);
  expect(response.statusCode).toBe(201);
  const document = teamDocumentSchema.parse(response.json());
  created.push(document.id);
  return document;
}

describe("GET /api/teams", () => {
  it("lists the teams of the user with the role in each", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/teams",
      headers: { cookie: admin },
    });
    expect(response.statusCode).toBe(200);
    expect(teamListSchema.parse(response.json()).items).toEqual([
      expect.objectContaining({ id: ids.teamNorth, role: "admin" }),
    ]);
    const multi = await login(app, accounts.multi);
    const both = await app.inject({
      method: "GET",
      url: "/api/teams",
      headers: { cookie: multi },
    });
    expect(
      teamListSchema
        .parse(both.json())
        .items.map((team) => team.id)
        .sort(),
    ).toEqual([ids.teamNorth, ids.teamSouth]);
  });

  it("requires a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/teams" });
    expect(response.statusCode).toBe(401);
  });
});

describe("team collection documents", () => {
  it("lets a team admin upload, queues indexing and lists the document", async () => {
    const document = await createTeamDocument();
    expect(document).toMatchObject({
      team_id: ids.teamNorth,
      deal_id: null,
      processing_status: "pending",
      indexed_at: null,
      processing_error: null,
      mime_type: PDF_MIME,
    });
    const jobs = await db.indexJob.findMany({
      where: { documentId: document.id },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("queued");

    const list = await app.inject({
      method: "GET",
      url: teamUrl(ids.teamNorth),
      headers: { cookie: admin },
    });
    expect(list.statusCode).toBe(200);
    const items = teamDocumentListSchema.parse(list.json()).items;
    expect(items.map((item) => item.id)).toContain(document.id);
    // The list also covers the documents of the team's deals.
    expect(items.map((item) => item.id)).toContain(ids.docNorthContract);
    expect(JSON.stringify(list.json())).not.toContain("file_data");
  });

  it("does not leak documents of another team into the list", async () => {
    const response = await app.inject({
      method: "GET",
      url: teamUrl(ids.teamSouth),
      headers: { cookie: await login(app, accounts.multi) },
    });
    const ids_ = teamDocumentListSchema
      .parse(response.json())
      .items.map((item) => item.id);
    expect(ids_).toContain(ids.docSouthContract);
    expect(ids_).not.toContain(ids.docNorthContract);
  });

  it("answers 403 to members and 404 to non-members", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: teamUrl(ids.teamNorth),
          headers: { cookie: member },
        })
      ).statusCode,
    ).toBe(403);
    expect((await uploadTeam(ids.teamNorth, member)).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: teamUrl(ids.teamNorth),
          headers: { cookie: other },
        })
      ).statusCode,
    ).toBe(404);
    expect((await uploadTeam(ids.teamNorth, other)).statusCode).toBe(404);
  });

  it("rejects contracts, amendments and parents in the collection", async () => {
    for (const type of ["contract", "amendment"]) {
      const response = await uploadTeam(ids.teamNorth, admin, [
        { name: "title", value: "Not allowed" },
        { name: "type", value: type },
        filePart(),
      ]);
      expect(response.statusCode).toBe(400);
    }
    const withParent = await uploadTeam(ids.teamNorth, admin, [
      ...fields([{ name: "parent_document_id", value: ids.docNorthContract }]),
      filePart(),
    ]);
    expect(withParent.statusCode).toBe(400);
  });

  it("rejects an invalid file after valid fields", async () => {
    const response = await uploadTeam(ids.teamNorth, admin, [
      ...fields(),
      filePart(new Uint8Array([1, 2, 3]), "x.pdf"),
    ]);
    expect(response.statusCode).toBe(415);
  });

  it("serves the file to members of the team and hides it from other teams", async () => {
    const document = await createTeamDocument();
    const download = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/file`,
      headers: { cookie: member },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(Buffer.from(download.rawPayload).equals(Buffer.from(pdf))).toBe(
      true,
    );
    for (const path of ["file", "preview"])
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/documents/${document.id}/${path}`,
            headers: { cookie: other },
          })
        ).statusCode,
      ).toBe(404);
  });

  it("previews a PDF inline and waits for the representation of a DOCX", async () => {
    const pdfDocument = await createTeamDocument();
    const preview = await app.inject({
      method: "GET",
      url: `/api/documents/${pdfDocument.id}/preview`,
      headers: { cookie: member },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["content-type"]).toBe("application/pdf");
    expect(preview.headers["content-disposition"]).toMatch(/^inline;/);

    const docxDocument = await createTeamDocument([
      ...fields(),
      filePart(docx, "note.docx", DOCX_MIME),
    ]);
    const notReady = await app.inject({
      method: "GET",
      url: `/api/documents/${docxDocument.id}/preview`,
      headers: { cookie: member },
    });
    expect(notReady.statusCode).toBe(404);

    await db.document.update({
      where: { id: docxDocument.id },
      data: { pdfRepresentation: new Uint8Array(pdf) },
    });
    const ready = await app.inject({
      method: "GET",
      url: `/api/documents/${docxDocument.id}/preview`,
      headers: { cookie: member },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.headers["content-disposition"]).toContain("note.pdf");
    expect(ready.headers["content-type"]).toBe("application/pdf");
  });

  it("reindexes for admins only and never duplicates an active job", async () => {
    const document = await createTeamDocument();
    const asMember = await app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/reindex`,
      headers: { cookie: member, origin: ORIGIN },
    });
    expect(asMember.statusCode).toBe(403);
    const asOther = await app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/reindex`,
      headers: { cookie: other, origin: ORIGIN },
    });
    expect(asOther.statusCode).toBe(404);

    await db.document.update({
      where: { id: document.id },
      data: { processingStatus: "failed", processingError: "OCR failed" },
    });
    const reindex = await app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/reindex`,
      headers: { cookie: admin, origin: ORIGIN },
    });
    expect(reindex.statusCode).toBe(200);
    expect(teamDocumentSchema.parse(reindex.json())).toMatchObject({
      processing_status: "pending",
      processing_error: null,
    });
    // The initial queued job is still active, so no second one is created.
    expect(
      await db.indexJob.count({ where: { documentId: document.id } }),
    ).toBe(1);
  });

  it("does not support PATCH for collection documents and deletes them with their jobs", async () => {
    const document = await createTeamDocument();
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/documents/${document.id}`,
      headers: { cookie: admin, origin: ORIGIN },
      payload: { title: "Renamed" },
    });
    expect(patch.statusCode).toBe(400);
    const forbidden = await app.inject({
      method: "DELETE",
      url: `/api/documents/${document.id}`,
      headers: { cookie: member, origin: ORIGIN },
    });
    expect(forbidden.statusCode).toBe(403);
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/documents/${document.id}`,
      headers: { cookie: admin, origin: ORIGIN },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await db.document.count({ where: { id: document.id } })).toBe(0);
    expect(
      await db.indexJob.count({ where: { documentId: document.id } }),
    ).toBe(0);
  });
});

describe("deal document uploads queue indexing", () => {
  it("creates a job for a document uploaded to a deal", async () => {
    const body = multipart([
      { name: "title", value: "Handover" },
      { name: "type", value: "handover_report" },
      filePart(pdf, "handover.pdf"),
    ]);
    const response = await app.inject({
      method: "POST",
      url: `/api/deals/${ids.dealNorthRental}/documents`,
      headers: {
        cookie: admin,
        origin: ORIGIN,
        ...body.headers,
      },
      payload: body.payload,
    });
    expect(response.statusCode).toBe(201);
    const id = documentMetadataSchema.parse(response.json()).id;
    created.push(id);
    expect(await db.indexJob.count({ where: { documentId: id } })).toBe(1);
  });
});
