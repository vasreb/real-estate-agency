export type Embedder = {
  readonly model: string;
  readonly dimensions: number;
  /** Document passages for storage, or a user query for search. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
};

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 64;
/** Indexing may wait out a rate limit; a user waiting for an answer may not. */
const MAX_ATTEMPTS = { document: 6, query: 2 } as const;
/** Accounts without a payment method are limited to a few requests a minute. */
const RATE_LIMIT_WAIT_MS = 21_000;
const MAX_WAIT_MS = 60_000;

/** Voyage AI embeddings over REST; retries rate limits and server errors. */
export function createVoyageEmbedder(options: {
  apiKey: string;
  model: string;
  dimensions: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Embedder {
  const request = options.fetch ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function embedBatch(texts: string[], kind: "document" | "query") {
    for (let attempt = 1; ; attempt++) {
      const response = await request(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: texts,
          model: options.model,
          input_type: kind,
          output_dimension: options.dimensions,
        }),
      });
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { embedding: number[]; index: number }[];
        };
        const data = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
        if (
          data.length !== texts.length ||
          data.some((item) => item.embedding.length !== options.dimensions)
        )
          throw new Error("Embedding response has an unexpected shape");
        return data.map((item) => item.embedding);
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS[kind])
        // Never include the request or the key in the error.
        throw new Error(`Embedding request failed (HTTP ${response.status})`);
      const asked = Number(response.headers.get("retry-after"));
      const wait =
        response.status === 429
          ? Number.isFinite(asked) && asked > 0
            ? asked * 1000
            : RATE_LIMIT_WAIT_MS
          : 500 * 2 ** (attempt - 1);
      await sleep(Math.min(wait, MAX_WAIT_MS));
    }
  }

  return {
    model: options.model,
    dimensions: options.dimensions,
    async embed(texts, kind) {
      const result: number[][] = [];
      for (let start = 0; start < texts.length; start += BATCH_SIZE)
        result.push(
          ...(await embedBatch(texts.slice(start, start + BATCH_SIZE), kind)),
        );
      return result;
    },
  };
}
