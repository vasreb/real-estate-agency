// Generated from canonical Zod schemas and operation descriptors. Do not edit.
export interface paths {
  "/api/auth/login": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403. */
    post: operations["login"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/auth/logout": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403. */
    post: operations["logout"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/deals": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listDeals"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/deals/{dealId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getDeal"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/deals/{dealId}/documents": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** @description Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403. */
    post: operations["uploadDocument"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/api/documents/{documentId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** @description Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403. */
    delete: operations["deleteDocument"];
    options?: never;
    head?: never;
    /** @description Unsafe method: the browser-sent Origin header must equal PUBLIC_ORIGIN exactly, otherwise 403. */
    patch: operations["patchDocument"];
    trace?: never;
  };
  "/api/documents/{documentId}/file": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["downloadDocument"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          email: string;
          password: string;
        };
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Error */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  listDeals: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            items: {
              client_name: string;
              /** Format: uuid */
              id: string;
              number: string;
              property_address: string;
              team_name: string;
              /** @enum {string} */
              type: "sale" | "rental";
            }[];
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  getDeal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        dealId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            client: {
              /** Format: uuid */
              id: string;
              name: string;
            };
            documents: {
              /** Format: date-time */
              created_at: string;
              /** Format: uuid */
              deal_id: string;
              document_date: string | null;
              document_number: string | null;
              effective_from: string | null;
              file_name: string;
              /** Format: uuid */
              id: string;
              /** @enum {string} */
              mime_type:
                | "application/pdf"
                | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
              parent_document_id: string | null;
              /** @enum {string} */
              status: "draft" | "signed" | "unknown";
              title: string;
              /** @enum {string} */
              type:
                | "contract"
                | "amendment"
                | "listing_sheet"
                | "handover_report"
                | "other";
            }[];
            /** Format: uuid */
            id: string;
            number: string;
            property: {
              address: string;
              /** Format: uuid */
              id: string;
            };
            /** @enum {string} */
            role: "member" | "admin";
            team: {
              /** Format: uuid */
              id: string;
              name: string;
            };
            /** @enum {string} */
            type: "sale" | "rental";
          };
        };
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  uploadDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        dealId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "multipart/form-data": {
          /** Format: date */
          document_date?: string;
          document_number?: string;
          /** Format: date */
          effective_from?: string;
          /** Format: binary */
          file: string;
          /** Format: uuid */
          parent_document_id?: string;
          /**
           * @default unknown
           * @enum {string}
           */
          status?: "draft" | "signed" | "unknown";
          title: string;
          /** @enum {string} */
          type:
            | "contract"
            | "amendment"
            | "listing_sheet"
            | "handover_report"
            | "other";
        };
      };
    };
    responses: {
      /** @description Success */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** Format: date-time */
            created_at: string;
            /** Format: uuid */
            deal_id: string;
            document_date: string | null;
            document_number: string | null;
            effective_from: string | null;
            file_name: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            mime_type:
              | "application/pdf"
              | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            parent_document_id: string | null;
            /** @enum {string} */
            status: "draft" | "signed" | "unknown";
            title: string;
            /** @enum {string} */
            type:
              | "contract"
              | "amendment"
              | "listing_sheet"
              | "handover_report"
              | "other";
          };
        };
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      415: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  deleteDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  patchDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": {
          document_date?: string | null;
          document_number?: string | null;
          effective_from?: string | null;
          parent_document_id?: string | null;
          /** @enum {string} */
          status?: "draft" | "signed" | "unknown";
          title?: string;
        };
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** Format: date-time */
            created_at: string;
            /** Format: uuid */
            deal_id: string;
            document_date: string | null;
            document_number: string | null;
            effective_from: string | null;
            file_name: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            mime_type:
              | "application/pdf"
              | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            parent_document_id: string | null;
            /** @enum {string} */
            status: "draft" | "signed" | "unknown";
            title: string;
            /** @enum {string} */
            type:
              | "contract"
              | "amendment"
              | "listing_sheet"
              | "handover_report"
              | "other";
          };
        };
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
  downloadDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description attachment with filename and UTF-8 filename* */
          "Content-Disposition"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/pdf": string;
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": string;
        };
      };
      /** @description Error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
      /** @description Error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": {
            /** @enum {string} */
            code:
              | "VALIDATION_ERROR"
              | "UNAUTHENTICATED"
              | "FORBIDDEN"
              | "NOT_FOUND"
              | "DOCUMENT_REFERENCED"
              | "PAYLOAD_TOO_LARGE"
              | "UNSUPPORTED_FILE_TYPE"
              | "RATE_LIMITED"
              | "INTERNAL_ERROR";
            message: string;
          };
        };
      };
    };
  };
}
