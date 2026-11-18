import {
  chatRequestSchema,
  chatResponseSchema,
  chatStreamEventSchema,
  type ChatStreamEvent,
} from "@agency/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { HttpError } from "../../../infrastructure/errors.js";
import type { RateLimiter } from "../../../infrastructure/security/rate-limit.js";
import type { Assistant } from "../application/assistant-service.js";

const CHAT_BODY_LIMIT = 262_144;

/** One event per line; every line is checked against the published schema. */
async function* ndjson(
  events: AsyncIterable<ChatStreamEvent>,
): AsyncGenerator<string> {
  yield `${JSON.stringify(chatStreamEventSchema.parse({ type: "status", stage: "working" }))}
`;
  for await (const event of events)
    yield `${JSON.stringify(chatStreamEventSchema.parse(event))}
`;
}

export function registerAssistantRoutes(
  app: FastifyInstance,
  options: {
    assistant: Assistant;
    authenticate: (request: FastifyRequest) => Promise<{ userId: string }>;
    limiter: RateLimiter;
  },
) {
  app.post("/api/chat", { bodyLimit: CHAT_BODY_LIMIT }, async (request) => {
    const { userId } = await options.authenticate(request);
    const input = chatRequestSchema.parse(request.body);
    const limit = options.limiter.hit(userId);
    if (!limit.allowed)
      throw new HttpError("RATE_LIMITED", limit.retryAfterSeconds);
    try {
      return chatResponseSchema.parse(
        await options.assistant.chat(userId, input),
      );
    } catch (error) {
      // Our own errors (404 scope, validation) pass through; provider and
      // embedding failures are reported without details.
      if (error instanceof HttpError) throw error;
      request.log.error(
        { code: "ASSISTANT_FAILED" },
        "Assistant request failed",
      );
      throw new HttpError("ASSISTANT_UNAVAILABLE");
    }
  });

  app.post(
    "/api/chat/stream",
    { bodyLimit: CHAT_BODY_LIMIT },
    async (request, reply) => {
      const { userId } = await options.authenticate(request);
      const input = chatRequestSchema.parse(request.body);
      const limit = options.limiter.hit(userId);
      if (!limit.allowed)
        throw new HttpError("RATE_LIMITED", limit.retryAfterSeconds);
      // A closed tab stops the model request instead of paying for it.
      const aborted = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableFinished) aborted.abort();
      });
      let events: AsyncIterable<ChatStreamEvent>;
      try {
        // Scope is checked here, before the first byte: a foreign team or
        // deal is a real 404, not a streamed 200.
        events = await options.assistant.chatStream(userId, input, {
          signal: aborted.signal,
          onError: () => {
            // A closed tab is not a failure of the assistant.
            if (aborted.signal.aborted)
              request.log.info("Assistant request cancelled by the client");
            else
              request.log.error(
                { code: "ASSISTANT_FAILED" },
                "Assistant request failed",
              );
          },
        });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        request.log.error(
          { code: "ASSISTANT_FAILED" },
          "Assistant request failed",
        );
        throw new HttpError("ASSISTANT_UNAVAILABLE");
      }
      return reply
        .header("Content-Type", "application/x-ndjson; charset=utf-8")
        .header("Cache-Control", "private, no-store, no-transform")
        .header("X-Accel-Buffering", "no")
        .send(Readable.from(ndjson(events)));
    },
  );
}
