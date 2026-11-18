import type {
  CreateDocumentInput,
  CreateTeamDocumentInput,
  DealScope,
  DocumentMetadata,
  PatchDocumentInput,
  Role,
  TeamDocument,
  TeamScope,
} from "@agency/contracts";
import type { Database } from "../../../infrastructure/database/index.js";
import { HttpError } from "../../../infrastructure/errors.js";
import {
  parentRequirement,
  toDocumentUpdate,
  toSqlDate,
} from "../domain/document-rules.js";
import { postgresError } from "../infrastructure/database-errors.js";
import {
  documentMetadataSelect,
  toDocumentMetadata,
} from "../infrastructure/metadata-reader.js";
import {
  createTeamDocumentReader,
  teamDocumentSelect,
  toTeamDocument,
} from "../infrastructure/team-document-reader.js";

export type DocumentCommandOptions = {
  database: Database;
  /** Injected from the deals module by the composition root. */
  getAccessibleDealScope: (
    userId: string,
    dealId: string,
  ) => Promise<DealScope | null>;
  /** Injected from the teams module by the composition root. */
  getAccessibleTeamScope: (
    userId: string,
    teamId: string,
  ) => Promise<TeamScope | null>;
};

export type StoredFile = {
  bytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  mimeType: string;
};

type Transaction = Parameters<Parameters<Database["$transaction"]>[0]>[0];

const PARENT_FK = "documents_parent_same_deal_fk";

/** At most one active job per document; a duplicate insert is ignored. */
async function enqueueIndexing(tx: Transaction, documentId: string) {
  await tx.indexJob.createMany({
    data: [{ documentId }],
    skipDuplicates: true,
  });
}

type DocumentAccess = {
  document: { id: string; dealId: string | null; teamId: string };
  role: Role;
};

export function createDocumentCommands(options: DocumentCommandOptions) {
  const { database } = options;

  /** 404 for missing or foreign deals (checked first), then 403 for members. */
  async function authorizeDealWrite(
    userId: string,
    dealId: string,
  ): Promise<DealScope> {
    const scope = await options.getAccessibleDealScope(userId, dealId);
    if (!scope) throw new HttpError("NOT_FOUND");
    if (scope.role !== "admin") throw new HttpError("FORBIDDEN");
    return scope;
  }

  /**
   * Resolves the owning team from either owner (deal or team) and checks
   * membership. Missing and foreign documents are indistinguishable (404).
   */
  async function findDocumentAccess(
    userId: string,
    documentId: string,
  ): Promise<DocumentAccess> {
    const document = await database.document.findUnique({
      where: { id: documentId },
      select: { id: true, dealId: true, teamId: true },
    });
    if (!document) throw new HttpError("NOT_FOUND");
    if (document.dealId) {
      const scope = await options.getAccessibleDealScope(
        userId,
        document.dealId,
      );
      if (!scope) throw new HttpError("NOT_FOUND");
      return {
        document: {
          id: document.id,
          dealId: document.dealId,
          teamId: scope.team_id,
        },
        role: scope.role,
      };
    }
    const scope = document.teamId
      ? await options.getAccessibleTeamScope(userId, document.teamId)
      : null;
    if (!document.teamId || !scope) throw new HttpError("NOT_FOUND");
    return {
      document: { id: document.id, dealId: null, teamId: document.teamId },
      role: scope.role,
    };
  }

  /** 404 for missing or foreign teams (checked first), then 403 for members. */
  async function authorizeTeamWrite(
    userId: string,
    teamId: string,
  ): Promise<TeamScope> {
    const scope = await options.getAccessibleTeamScope(userId, teamId);
    if (!scope) throw new HttpError("NOT_FOUND");
    if (scope.role !== "admin") throw new HttpError("FORBIDDEN");
    return scope;
  }

  /**
   * Locks the parent with FOR KEY SHARE so a concurrent delete either waits
   * (and then fails with RESTRICT) or wins first (and the lookup finds nothing).
   * Generic 400 never reveals whether a parent exists in another deal.
   */
  async function assertLinkableParent(
    tx: Transaction,
    dealId: string,
    parentId: string,
  ) {
    const rows = await tx.$queryRaw<{ type: string }[]>`
      SELECT type::text AS type FROM documents
      WHERE id = ${parentId}::uuid AND deal_id = ${dealId}::uuid
      FOR KEY SHARE`;
    if (rows[0]?.type !== "contract") throw new HttpError("VALIDATION_ERROR");
  }

  function mapParentWriteError(error: unknown): never {
    const db = postgresError(error);
    if (db.code === "23503" && db.constraint === PARENT_FK)
      throw new HttpError("VALIDATION_ERROR");
    throw error;
  }

  const teamReader = createTeamDocumentReader({ database });

  return {
    authorizeDealWrite,
    authorizeTeamWrite,

    async listTeamDocuments(
      userId: string,
      teamId: string,
    ): Promise<TeamDocument[]> {
      await authorizeTeamWrite(userId, teamId);
      return teamReader.listTeamDocuments(teamId);
    },

    async createTeamDocument(
      userId: string,
      teamId: string,
      input: CreateTeamDocumentInput,
      file: StoredFile,
    ): Promise<TeamDocument> {
      await authorizeTeamWrite(userId, teamId);
      const row = await database.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            teamId,
            type: input.type,
            title: input.title,
            status: input.status,
            documentNumber: input.document_number ?? null,
            documentDate: input.document_date
              ? toSqlDate(input.document_date)
              : null,
            effectiveFrom: input.effective_from
              ? toSqlDate(input.effective_from)
              : null,
            fileName: file.fileName,
            mimeType: file.mimeType,
            fileData: file.bytes,
          },
          select: teamDocumentSelect,
        });
        await enqueueIndexing(tx, created.id);
        return created;
      });
      return toTeamDocument(row);
    },

    /** Puts a document back into the indexing queue (admin only). */
    async reindexDocument(
      userId: string,
      documentId: string,
    ): Promise<TeamDocument> {
      const { document, role } = await findDocumentAccess(userId, documentId);
      if (role !== "admin") throw new HttpError("FORBIDDEN");
      const row = await database.$transaction(async (tx) => {
        const updated = await tx.document.update({
          where: { id: document.id },
          data: { processingStatus: "pending", processingError: null },
          select: teamDocumentSelect,
        });
        await enqueueIndexing(tx, document.id);
        return updated;
      });
      return toTeamDocument(row);
    },

    async createDocument(
      userId: string,
      dealId: string,
      input: CreateDocumentInput,
      file: StoredFile,
    ): Promise<DocumentMetadata> {
      const scope = await authorizeDealWrite(userId, dealId);
      const requirement = parentRequirement(
        input.type,
        input.parent_document_id,
        "",
      );
      if (requirement === "invalid") throw new HttpError("VALIDATION_ERROR");
      try {
        const row = await database.$transaction(async (tx) => {
          if (requirement === "lookup")
            await assertLinkableParent(tx, scope.id, input.parent_document_id!);
          const created = await tx.document.create({
            data: {
              dealId: scope.id,
              type: input.type,
              title: input.title,
              status: input.status,
              documentNumber: input.document_number ?? null,
              documentDate: input.document_date
                ? toSqlDate(input.document_date)
                : null,
              effectiveFrom: input.effective_from
                ? toSqlDate(input.effective_from)
                : null,
              parentDocumentId: input.parent_document_id ?? null,
              fileName: file.fileName,
              mimeType: file.mimeType,
              fileData: file.bytes,
            },
            select: documentMetadataSelect,
          });
          await enqueueIndexing(tx, created.id);
          return created;
        });
        return toDocumentMetadata(row);
      } catch (error) {
        return mapParentWriteError(error);
      }
    },

    async updateDocument(
      userId: string,
      documentId: string,
      patch: PatchDocumentInput,
    ): Promise<DocumentMetadata> {
      const { document, role } = await findDocumentAccess(userId, documentId);
      if (role !== "admin") throw new HttpError("FORBIDDEN");
      // Team-collection documents are managed through the team documents API.
      const dealId = document.dealId;
      if (!dealId) throw new HttpError("VALIDATION_ERROR");
      const data = toDocumentUpdate(patch);
      try {
        const row = await database.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<{ type: string }[]>`
            SELECT type::text AS type FROM documents
            WHERE id = ${document.id}::uuid FOR UPDATE`;
          const type = locked[0]?.type as DocumentMetadata["type"] | undefined;
          if (!type) throw new HttpError("NOT_FOUND");
          const requirement = parentRequirement(
            type,
            data.parentDocumentId,
            document.id,
          );
          if (requirement === "invalid")
            throw new HttpError("VALIDATION_ERROR");
          if (requirement === "lookup")
            await assertLinkableParent(tx, dealId, data.parentDocumentId!);
          return tx.document.update({
            where: { id: document.id },
            data,
            select: documentMetadataSelect,
          });
        });
        return toDocumentMetadata(row);
      } catch (error) {
        return mapParentWriteError(error);
      }
    },

    async deleteDocument(userId: string, documentId: string): Promise<void> {
      const { document, role } = await findDocumentAccess(userId, documentId);
      if (role !== "admin") throw new HttpError("FORBIDDEN");
      try {
        const { count } = await database.document.deleteMany({
          where: { id: document.id },
        });
        if (count === 0) throw new HttpError("NOT_FOUND");
      } catch (error) {
        const db = postgresError(error);
        // The database RESTRICT constraint is the source of truth (no count-then-delete).
        if (
          (db.code === "23001" || db.code === "23503") &&
          db.constraint === PARENT_FK
        )
          throw new HttpError("DOCUMENT_REFERENCED");
        throw error;
      }
    },

    /** Members may read; bytes are loaded only after the scope check. */
    async readDocumentFile(
      userId: string,
      documentId: string,
    ): Promise<StoredFile> {
      const { document } = await findDocumentAccess(userId, documentId);
      const row = await database.document.findUnique({
        where: { id: document.id },
        select: { fileData: true, fileName: true, mimeType: true },
      });
      if (!row) throw new HttpError("NOT_FOUND");
      return {
        bytes: row.fileData,
        fileName: row.fileName,
        mimeType: row.mimeType,
      };
    },

    /**
     * PDF for in-browser viewing: the original for PDFs, the generated PDF
     * representation for DOCX. 404 while the representation is not ready.
     */
    async readDocumentPreview(
      userId: string,
      documentId: string,
    ): Promise<StoredFile> {
      const { document } = await findDocumentAccess(userId, documentId);
      const row = await database.document.findUnique({
        where: { id: document.id },
        select: {
          fileData: true,
          fileName: true,
          mimeType: true,
          pdfRepresentation: true,
        },
      });
      if (!row) throw new HttpError("NOT_FOUND");
      const isPdf = row.mimeType === "application/pdf";
      const bytes = isPdf ? row.fileData : row.pdfRepresentation;
      if (!bytes) throw new HttpError("NOT_FOUND");
      return {
        bytes,
        fileName: isPdf
          ? row.fileName
          : row.fileName.replace(/\.[^.]+$/, "") + ".pdf",
        mimeType: "application/pdf",
      };
    },
  };
}
export type DocumentCommands = ReturnType<typeof createDocumentCommands>;
