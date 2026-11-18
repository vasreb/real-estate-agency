import { z } from "zod";
import {
  loginSchema,
  createDocumentSchema,
  patchDocumentSchema,
  documentMetadataSchema,
  chatRequestSchema,
  chatResponseSchema,
  chatStreamEventSchema,
  createTeamDocumentSchema,
  teamDocumentSchema,
  teamDocumentListSchema,
  teamListSchema,
  dealListSchema,
  dealDetailSchema,
} from "./schemas.js";

type OperationDescriptor = {
  operationId: string;
  method: "get" | "post" | "patch" | "delete";
  path: string;
  status: 200 | 201 | 204;
  body?: z.ZodType;
  response?: z.ZodType;
  requestMedia?: "application/json" | "multipart/form-data";
  binary?: boolean;
  /** Binary response shown in the browser instead of downloaded. */
  inline?: boolean;
  /** Newline-delimited JSON: `response` describes each line. */
  stream?: boolean;
  authenticated: boolean;
  errors: number[];
};
export const operations: OperationDescriptor[] = [
  {
    operationId: "login",
    method: "post",
    path: "/api/auth/login",
    body: loginSchema,
    requestMedia: "application/json",
    status: 204,
    authenticated: false,
    errors: [400, 401, 403, 429],
  },
  {
    operationId: "logout",
    method: "post",
    path: "/api/auth/logout",
    status: 204,
    authenticated: false,
    errors: [403],
  },
  {
    operationId: "listDeals",
    method: "get",
    path: "/api/deals",
    response: dealListSchema,
    status: 200,
    authenticated: true,
    errors: [401],
  },
  {
    operationId: "getDeal",
    method: "get",
    path: "/api/deals/{dealId}",
    response: dealDetailSchema,
    status: 200,
    authenticated: true,
    errors: [400, 401, 404],
  },
  {
    operationId: "uploadDocument",
    method: "post",
    path: "/api/deals/{dealId}/documents",
    body: createDocumentSchema,
    requestMedia: "multipart/form-data",
    response: documentMetadataSchema,
    status: 201,
    authenticated: true,
    errors: [400, 401, 403, 404, 413, 415, 429],
  },
  {
    operationId: "downloadDocument",
    method: "get",
    path: "/api/documents/{documentId}/file",
    binary: true,
    status: 200,
    authenticated: true,
    errors: [400, 401, 404],
  },
  {
    operationId: "patchDocument",
    method: "patch",
    path: "/api/documents/{documentId}",
    body: patchDocumentSchema,
    requestMedia: "application/json",
    response: documentMetadataSchema,
    status: 200,
    authenticated: true,
    errors: [400, 401, 403, 404],
  },
  {
    operationId: "deleteDocument",
    method: "delete",
    path: "/api/documents/{documentId}",
    status: 204,
    authenticated: true,
    errors: [400, 401, 403, 404, 409],
  },
  {
    operationId: "listTeams",
    method: "get",
    path: "/api/teams",
    response: teamListSchema,
    status: 200,
    authenticated: true,
    errors: [401],
  },
  {
    operationId: "listTeamDocuments",
    method: "get",
    path: "/api/teams/{teamId}/documents",
    response: teamDocumentListSchema,
    status: 200,
    authenticated: true,
    errors: [400, 401, 403, 404],
  },
  {
    operationId: "uploadTeamDocument",
    method: "post",
    path: "/api/teams/{teamId}/documents",
    body: createTeamDocumentSchema,
    requestMedia: "multipart/form-data",
    response: teamDocumentSchema,
    status: 201,
    authenticated: true,
    errors: [400, 401, 403, 404, 413, 415, 429],
  },
  {
    operationId: "reindexDocument",
    method: "post",
    path: "/api/documents/{documentId}/reindex",
    response: teamDocumentSchema,
    status: 200,
    authenticated: true,
    errors: [400, 401, 403, 404],
  },
  {
    operationId: "previewDocument",
    method: "get",
    path: "/api/documents/{documentId}/preview",
    binary: true,
    inline: true,
    status: 200,
    authenticated: true,
    errors: [400, 401, 404],
  },
  {
    operationId: "chat",
    method: "post",
    path: "/api/chat",
    body: chatRequestSchema,
    requestMedia: "application/json",
    response: chatResponseSchema,
    status: 200,
    authenticated: true,
    errors: [400, 401, 404, 429, 503],
  },
  {
    operationId: "chatStream",
    method: "post",
    path: "/api/chat/stream",
    body: chatRequestSchema,
    requestMedia: "application/json",
    response: chatStreamEventSchema,
    stream: true,
    status: 200,
    authenticated: true,
    errors: [400, 401, 404, 429, 503],
  },
];
