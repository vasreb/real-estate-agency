import type { ChatInput, ChatResponse } from "@agency/contracts";
import { z } from "zod";
import { HttpError } from "../../../infrastructure/errors.js";
import type { SourceRef } from "../application/tools.js";

/**
 * Reference questions (spec section 7). Every question fixes the account, the
 * scope, the expected outcome and the right documents and pages.
 */
const sourceSchema = z.strictObject({
  document_id: z.uuid(),
  /** Pages (1-based) that must be covered; empty means any page. */
  pages: z.array(z.number().int().min(1)).default([]),
});

export const evalQuestionSchema = z.strictObject({
  id: z.string().min(1),
  description: z.string().default(""),
  /** Account that asks; resolved to a user ID by the runner. */
  user_email: z.string().min(1),
  team_id: z.uuid(),
  /** Earlier turns for follow-up questions (plain text only). */
  history: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .default([]),
  message: z.string().min(1),
  expect: z.strictObject({
    /**
     * answer: facts are in the documents. unanswerable: they are not, and the
     * answer must say so. denied: the scope is not the user's (HTTP 404).
     */
    kind: z.enum(["answer", "unanswerable", "denied"]),
    sources: z.array(sourceSchema).default([]),
    /** May be cited next to the sources (same deal, related) but are not required. */
    related_document_ids: z.array(z.uuid()).default([]),
    answer_includes: z.array(z.string()).default([]),
    answer_includes_any: z.array(z.string()).default([]),
    answer_excludes: z.array(z.string()).default([]),
    /** Documents and texts that must never reach the model or the answer. */
    forbidden_document_ids: z.array(z.uuid()).default([]),
    forbidden_text: z.array(z.string()).default([]),
  }),
});
export type EvalQuestion = z.infer<typeof evalQuestionSchema>;
export const evalQuestionsSchema = z.array(evalQuestionSchema).min(1);

export type Check = { name: string; passed: boolean; detail?: string };
export type QuestionResult = {
  id: string;
  kind: EvalQuestion["expect"]["kind"];
  /** Did the expected passages reach the model? */
  retrieval: Check[];
  /** Are the facts right and is uncertainty stated correctly? */
  answer: Check[];
  /** Do the cited passages support the answer and point at the right page? */
  citations: Check[];
  /** Nothing of another team reached the model, the answer or a citation. */
  isolation: Check[];
  usage: {
    model_calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    latency_ms: number;
  };
  /** The answer as shown to the employee, for review of failed checks. */
  answer_text?: string;
  /** What the answer cited, for review of failed citation checks. */
  cited?: { document_id: string; page_start: number; page_end: number }[];
  error?: string;
};

export type ChatFn = (
  userEmail: string,
  input: ChatInput,
  observe: (ref: SourceRef) => void,
) => Promise<ChatResponse>;

const lower = (value: string) => value.toLowerCase();
const check = (name: string, passed: boolean, detail?: string): Check => ({
  name,
  passed,
  ...(detail ? { detail } : {}),
});

function covers(
  pages: number[],
  range: { pageStart: number; pageEnd: number },
): boolean {
  return (
    pages.length === 0 ||
    pages.some((page) => page >= range.pageStart && page <= range.pageEnd)
  );
}

export function scoreQuestion(
  question: EvalQuestion,
  response: ChatResponse | null,
  seen: SourceRef[],
  failure: unknown,
): QuestionResult {
  const { expect } = question;
  const empty = {
    model_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    latency_ms: 0,
  };
  const base = {
    id: question.id,
    kind: expect.kind,
    retrieval: [] as Check[],
    answer: [] as Check[],
    citations: [] as Check[],
    isolation: [] as Check[],
    usage: empty,
  };

  // Isolation applies to every kind, including a request that was refused.
  const isolation = (answerText: string, cited: string[]) => [
    check(
      "no forbidden document reached the model",
      !seen.some((ref) =>
        expect.forbidden_document_ids.includes(ref.documentId),
      ),
    ),
    check(
      "no forbidden document cited",
      !cited.some((id) => expect.forbidden_document_ids.includes(id)),
    ),
    check(
      "no forbidden text in the answer",
      !expect.forbidden_text.some((text) =>
        lower(answerText).includes(lower(text)),
      ),
    ),
  ];

  if (expect.kind === "denied") {
    const denied = failure instanceof HttpError && failure.statusCode === 404;
    return {
      ...base,
      answer: [check("the request is refused as not found", denied)],
      isolation: isolation("", []),
      ...(failure && !denied ? { error: "unexpected failure" } : {}),
    };
  }
  if (!response)
    return {
      ...base,
      retrieval: expect.sources.map((source) =>
        check(`source ${source.document_id} retrieved`, false),
      ),
      answer: [check("an answer was produced", false)],
      isolation: isolation("", []),
      error: failure instanceof Error ? failure.message : "no response",
    };

  const text = response.answer.map((part) => part.text).join("");
  const cited = response.citations.map((citation) => citation.document_id);
  const retrieval = expect.sources.map((source) =>
    check(
      `source ${source.document_id}${source.pages.length ? ` p. ${source.pages.join(",")}` : ""} retrieved`,
      seen.some(
        (ref) =>
          ref.documentId === source.document_id && covers(source.pages, ref),
      ),
    ),
  );
  const answer = [
    ...expect.answer_includes.map((needle) =>
      check(`answer states "${needle}"`, lower(text).includes(lower(needle))),
    ),
    ...(expect.answer_includes_any.length
      ? [
          check(
            `answer states one of: ${expect.answer_includes_any.join(" | ")}`,
            expect.answer_includes_any.some((needle) =>
              lower(text).includes(lower(needle)),
            ),
          ),
        ]
      : []),
    ...expect.answer_excludes.map((needle) =>
      check(`answer avoids "${needle}"`, !lower(text).includes(lower(needle))),
    ),
  ];
  const citations: Check[] = [];
  if (expect.kind === "answer") {
    citations.push(
      check("the answer has citations", response.citations.length > 0),
    );
    for (const source of expect.sources)
      citations.push(
        check(
          `cites ${source.document_id}${source.pages.length ? ` p. ${source.pages.join(",")}` : ""}`,
          response.citations.some(
            (citation) =>
              citation.document_id === source.document_id &&
              covers(source.pages, {
                pageStart: citation.page_start,
                pageEnd: citation.page_end,
              }),
          ),
        ),
      );
    // Precision: every citation points at an expected document.
    if (expect.sources.length)
      citations.push(
        check(
          "every citation points at an expected document",
          response.citations.every(
            (citation) =>
              expect.sources.some(
                (source) => source.document_id === citation.document_id,
              ) || expect.related_document_ids.includes(citation.document_id),
          ),
        ),
      );
  }
  return {
    ...base,
    answer_text: text,
    cited: response.citations.map((citation) => ({
      document_id: citation.document_id,
      page_start: citation.page_start,
      page_end: citation.page_end,
    })),
    retrieval,
    answer,
    citations,
    isolation: isolation(text, cited),
    usage: {
      model_calls: response.usage.model_calls,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_tokens,
      cache_creation_tokens: response.usage.cache_creation_tokens,
      latency_ms: response.usage.latency_ms,
    },
  };
}

export async function runEvaluation(
  questions: EvalQuestion[],
  chat: ChatFn,
): Promise<QuestionResult[]> {
  const results: QuestionResult[] = [];
  for (const question of questions) {
    const seen: SourceRef[] = [];
    let response: ChatResponse | null = null;
    let failure: unknown;
    try {
      response = await chat(
        question.user_email,
        {
          team_id: question.team_id,
          message: question.message,
          history: question.history,
          state: { deal_ids: [], document_ids: [] },
        },
        (ref) => seen.push(ref),
      );
    } catch (error) {
      failure = error;
    }
    results.push(scoreQuestion(question, response, seen, failure));
  }
  return results;
}

const DIMENSIONS = ["retrieval", "answer", "citations", "isolation"] as const;
type Dimension = (typeof DIMENSIONS)[number];

export type Pricing = {
  /** Price per million tokens, in the currency of the report. */
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
};

export type Report = {
  model: string;
  questions: number;
  dimensions: Record<
    Dimension,
    { checks: number; passed: number; questions_failed: string[] }
  >;
  usage: {
    model_calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost: number | null;
    latency_ms_mean: number;
    latency_ms_p95: number;
  };
  results: QuestionResult[];
};

export function buildReport(
  model: string,
  results: QuestionResult[],
  pricing?: Pricing,
): Report {
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const checks = results.flatMap((r) => r[dimension]);
      return [
        dimension,
        {
          checks: checks.length,
          passed: checks.filter((c) => c.passed).length,
          questions_failed: results
            .filter((r) => r[dimension].some((c) => !c.passed))
            .map((r) => r.id),
        },
      ];
    }),
  ) as Report["dimensions"];
  const sum = (key: keyof QuestionResult["usage"]) =>
    results.reduce((total, r) => total + r.usage[key], 0);
  const latencies = results
    .map((r) => r.usage.latency_ms)
    .sort((a, b) => a - b);
  const p95 = latencies.length
    ? latencies[
        Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
      ]!
    : 0;
  const usage = {
    model_calls: sum("model_calls"),
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    cache_read_tokens: sum("cache_read_tokens"),
    cache_creation_tokens: sum("cache_creation_tokens"),
  };
  const estimated = pricing
    ? (usage.input_tokens * pricing.inputPerMillion +
        usage.output_tokens * pricing.outputPerMillion +
        usage.cache_read_tokens * (pricing.cacheReadPerMillion ?? 0) +
        usage.cache_creation_tokens * (pricing.cacheWritePerMillion ?? 0)) /
      1_000_000
    : null;
  return {
    model,
    questions: results.length,
    dimensions,
    usage: {
      ...usage,
      estimated_cost: estimated,
      latency_ms_mean: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      latency_ms_p95: p95,
    },
    results,
  };
}

export function formatReport(report: Report): string {
  const lines = [`# Assistant evaluation: ${report.model}`, ""];
  lines.push(`Questions: ${report.questions}`, "");
  lines.push("| Dimension | Checks passed | Questions with a failed check |");
  lines.push("|---|---|---|");
  const titles: Record<Dimension, string> = {
    retrieval: "Retrieval (right passage reached the model)",
    answer: "Answer (facts and stated uncertainty)",
    citations: "Citations (support and page)",
    isolation: "Data isolation",
  };
  for (const dimension of DIMENSIONS) {
    const row = report.dimensions[dimension];
    lines.push(
      `| ${titles[dimension]} | ${row.passed}/${row.checks} | ${row.questions_failed.join(", ") || "none"} |`,
    );
  }
  const u = report.usage;
  lines.push(
    "",
    "## Cost and latency",
    `- Model calls: ${u.model_calls}`,
    `- Input tokens: ${u.input_tokens} (cache read ${u.cache_read_tokens}, cache write ${u.cache_creation_tokens})`,
    `- Output tokens: ${u.output_tokens}`,
    `- Estimated cost: ${u.estimated_cost === null ? "not computed (no prices given)" : u.estimated_cost.toFixed(4)}`,
    `- Latency: mean ${u.latency_ms_mean} ms, p95 ${u.latency_ms_p95} ms`,
    "",
    "## Failed checks",
  );
  const failed = report.results.flatMap((result) =>
    DIMENSIONS.flatMap((dimension) =>
      result[dimension]
        .filter((c) => !c.passed)
        .map((c) => `- ${result.id} / ${dimension}: ${c.name}`),
    ),
  );
  lines.push(...(failed.length ? failed : ["- none"]));
  return lines.join("\n") + "\n";
}
