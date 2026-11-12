import type { FastifyBaseLogger } from "fastify";
import { pino, type DestinationStream } from "pino";

export function createLogger(
  level: string,
  destination?: DestinationStream,
): FastifyBaseLogger {
  return pino(
    {
      level,
      redact: {
        paths: [
          "req.headers.cookie",
          // @fastify/multipart logs busboy options (incl. request headers) at trace.
          "busboyOptions.headers",
          "headers.cookie",
          "headers.authorization",
          "*.headers.cookie",
          "*.headers.authorization",
          "req.headers.authorization",
          'res.headers["set-cookie"]',
          "password",
          "token",
          "token_hash",
          "password_hash",
          "file_data",
          "body",
          "req.body",
        ],
        remove: true,
      },
      serializers: {
        // Never serialize raw URL/query strings, headers, body, errors, or SQL.
        req: (req: { method?: string }) => ({ method: req.method }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        err: () => ({ message: "Internal error" }),
      },
    },
    destination,
  );
}
