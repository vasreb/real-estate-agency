import type { ChatResponse } from "@agency/contracts";
import { HttpError } from "../../src/infrastructure/errors.js";
import {
  buildReport,
  evalQuestionSchema,
  formatReport,
  runEvaluation,
  scoreQuestion,
  type EvalQuestion,
} from "../../src/modules/assistant/evaluation/index.js";

const doc = "60000000-0000-4000-8000-000000000001";
const foreign = "60000000-0000-4000-8000-000000000003";
const team = "10000000-0000-4000-8000-000000000001";

const question = (overrides: Record<string, unknown> = {}): EvalQuestion =>
  evalQuestionSchema.parse({
    id: "q1",
    user_email: "admin@agency.test",
    team_id: team,
    message: "What is the rent?",
    expect: {
      kind: "answer",
      sources: [{ document_id: doc, pages: [2] }],
      answer_includes: ["1350"],
      answer_excludes: ["1200 EUR per month"],
      forbidden_document_ids: [foreign],
      forbidden_text: ["Borealis"],
    },
    ...overrides,
  });

const response = (overrides: Partial<ChatResponse> = {}): ChatResponse => ({
  answer: [{ text: "The rent is 1350 EUR.", citations: [1] }],
  citations: [
    {
      id: 1,
      document_id: doc,
      title: "Amendment",
      page_start: 2,
      page_end: 3,
      quote: "q",
      preview_url: "/x",
    },
  ],
  state: { deal_ids: [], document_ids: [] },
  usage: {
    model: "m",
    model_calls: 2,
    input_tokens: 1000,
    output_tokens: 100,
    cache_read_tokens: 500,
    cache_creation_tokens: 200,
    latency_ms: 1200,
    stopped_by_budget: false,
  },
  ...overrides,
});
const seen = (documentId: string, pageStart = 2, pageEnd = 2) => ({
  source: `chunk:${documentId}:${pageStart}`,
  documentId,
  title: "t",
  pageStart,
  pageEnd,
});

const failed = (checks: { passed: boolean }[]) =>
  checks.filter((c) => !c.passed).length;

describe("scoreQuestion", () => {
  it("passes a correct, cited and isolated answer in every dimension", () => {
    const result = scoreQuestion(
      question(),
      response(),
      [seen(doc)],
      undefined,
    );
    for (const dimension of [
      "retrieval",
      "answer",
      "citations",
      "isolation",
    ] as const)
      expect(`${dimension}: ${failed(result[dimension])}`).toBe(
        `${dimension}: 0`,
      );
    expect(result.usage.model_calls).toBe(2);
  });

  it("separates retrieval from answer quality", () => {
    // The right page never reached the model, yet the answer looks right.
    const result = scoreQuestion(
      question(),
      response(),
      [seen(doc, 5, 5)],
      undefined,
    );
    expect(failed(result.retrieval)).toBe(1);
    expect(failed(result.answer)).toBe(0);
  });

  it("flags a wrong fact and a forbidden phrase", () => {
    const wrong = response({
      answer: [
        { text: "Rent is 1200 EUR per month. Borealis.", citations: [] },
      ],
    });
    const result = scoreQuestion(question(), wrong, [seen(doc)], undefined);
    expect(failed(result.answer)).toBe(2);
    expect(failed(result.isolation)).toBe(1);
  });

  it("checks that citations point at the right page and expected documents", () => {
    const wrongPage = response({
      citations: [{ ...response().citations[0]!, page_start: 7, page_end: 7 }],
    });
    expect(
      failed(
        scoreQuestion(question(), wrongPage, [seen(doc)], undefined).citations,
      ),
    ).toBeGreaterThan(0);
    const other = response({
      citations: [
        ...response().citations,
        { ...response().citations[0]!, id: 2, document_id: foreign },
      ],
    });
    const result = scoreQuestion(question(), other, [seen(doc)], undefined);
    expect(failed(result.citations)).toBeGreaterThan(0);
    expect(failed(result.isolation)).toBe(1);
  });

  it("allows citing a related document but not an unrelated one", () => {
    const withRelated = question({
      expect: {
        kind: "answer",
        sources: [{ document_id: doc, pages: [2] }],
        related_document_ids: [foreign],
      },
    });
    const other = response({
      citations: [
        ...response().citations,
        { ...response().citations[0]!, id: 2, document_id: foreign },
      ],
    });
    const precision = (q: EvalQuestion) =>
      scoreQuestion(q, other, [seen(doc)], undefined).citations.find(
        (c) => c.name === "every citation points at an expected document",
      )!.passed;
    expect(precision(withRelated)).toBe(true);
    expect(precision(question())).toBe(false);
  });

  it("detects a forbidden passage that reached the model even if not cited", () => {
    const result = scoreQuestion(
      question(),
      response(),
      [seen(doc), seen(foreign)],
      undefined,
    );
    expect(failed(result.isolation)).toBe(1);
  });

  it("requires an unanswerable question to state the gap, with no citations needed", () => {
    const q = question({
      expect: {
        kind: "unanswerable",
        answer_includes_any: ["not confirmed", "could not find"],
      },
    });
    const good = response({
      answer: [{ text: "The current tenant is not confirmed.", citations: [] }],
      citations: [],
    });
    expect(failed(scoreQuestion(q, good, [], undefined).answer)).toBe(0);
    expect(scoreQuestion(q, good, [], undefined).citations).toEqual([]);
    const bad = response({
      answer: [{ text: "It is Acme.", citations: [] }],
      citations: [],
    });
    expect(failed(scoreQuestion(q, bad, [], undefined).answer)).toBe(1);
  });

  it("expects a foreign scope to be refused with not found", () => {
    const q = question({
      expect: { kind: "denied", forbidden_document_ids: [foreign] },
    });
    expect(
      failed(scoreQuestion(q, null, [], new HttpError("NOT_FOUND")).answer),
    ).toBe(0);
    expect(failed(scoreQuestion(q, response(), [], undefined).answer)).toBe(1);
    expect(
      failed(scoreQuestion(q, null, [], new HttpError("FORBIDDEN")).answer),
    ).toBe(1);
  });

  it("records a failed run as failed checks instead of throwing", () => {
    const result = scoreQuestion(
      question(),
      null,
      [],
      new Error("provider down"),
    );
    expect(result.error).toBe("provider down");
    expect(failed(result.answer)).toBe(1);
    expect(failed(result.retrieval)).toBe(1);
  });
});

describe("runEvaluation and report", () => {
  it("runs each question, passes the scope through and reports per dimension", async () => {
    const calls: unknown[] = [];
    const results = await runEvaluation(
      [question(), question({ id: "q2", message: "Second" })],
      (email, input, observe) => {
        calls.push([email, input.message, input.team_id]);
        observe(seen(doc));
        return Promise.resolve(response());
      },
    );
    expect(calls).toEqual([
      ["admin@agency.test", "What is the rent?", team],
      ["admin@agency.test", "Second", team],
    ]);
    const report = buildReport("claude-test", results, {
      inputPerMillion: 1,
      outputPerMillion: 5,
      cacheReadPerMillion: 0.1,
      cacheWritePerMillion: 1.25,
    });
    expect(report.questions).toBe(2);
    expect(report.dimensions.retrieval).toMatchObject({ passed: 2, checks: 2 });
    expect(report.usage).toMatchObject({
      model_calls: 4,
      input_tokens: 2000,
      output_tokens: 200,
      latency_ms_mean: 1200,
      latency_ms_p95: 1200,
    });
    // 2000*1 + 200*5 + 1000*0.1 + 400*1.25 = 3600 per million.
    expect(report.usage.estimated_cost).toBeCloseTo(0.0036, 6);
    const text = formatReport(report);
    expect(text).toContain("Data isolation");
    expect(text).toContain("Failed checks\n- none");
  });

  it("does not invent a cost without prices and lists failed checks", async () => {
    const results = await runEvaluation([question()], () =>
      Promise.resolve(
        response({
          answer: [{ text: "Unknown.", citations: [] }],
          citations: [],
        }),
      ),
    );
    const report = buildReport("m", results);
    expect(report.usage.estimated_cost).toBeNull();
    expect(report.dimensions.answer.questions_failed).toEqual(["q1"]);
    const text = formatReport(report);
    expect(text).toContain("not computed");
    expect(text).toContain('- q1 / answer: answer states "1350"');
  });

  it("rejects malformed question files", () => {
    expect(() => evalQuestionSchema.parse({ id: "x" })).toThrow();
    expect(() =>
      evalQuestionSchema.parse({
        ...question(),
        expect: { kind: "answer", surprise: true },
      }),
    ).toThrow();
  });
});
