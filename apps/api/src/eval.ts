import { readFile, writeFile } from "node:fs/promises";
import { loadAssistantConfig } from "./infrastructure/config.js";
import { createDatabase } from "./infrastructure/database/index.js";
import {
  buildReport,
  createAnthropicLlm,
  createAssistant,
  createRetrievalRepository,
  evalQuestionsSchema,
  formatReport,
  runEvaluation,
  type Pricing,
} from "./modules/assistant/index.js";
import { createVoyageEmbedder } from "./modules/indexing/index.js";
import { createTeamQueries } from "./modules/teams/index.js";

/**
 * Runs the reference questions against the real model and the real index.
 *
 *   node dist/eval.js --questions questions.json [--markdown report.md] [--json report.json]
 *
 * Needs DATABASE_URL, ANTHROPIC_API_KEY and VOYAGE_API_KEY. Prices per million
 * tokens come from EVAL_PRICE_INPUT / EVAL_PRICE_OUTPUT (optionally
 * EVAL_PRICE_CACHE_READ / EVAL_PRICE_CACHE_WRITE); without them the cost is
 * reported as not computed rather than guessed.
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const questionsPath = option("questions");
const databaseUrl = process.env.DATABASE_URL;
if (!questionsPath || !databaseUrl)
  throw new Error("Usage: --questions <file> with DATABASE_URL set.");
const config = loadAssistantConfig();
if (!config.ANTHROPIC_API_KEY || !config.VOYAGE_API_KEY)
  throw new Error("ANTHROPIC_API_KEY and VOYAGE_API_KEY are required.");

const questions = evalQuestionsSchema.parse(
  JSON.parse(await readFile(questionsPath, "utf8")),
);
const database = createDatabase(databaseUrl);
const teams = createTeamQueries({ database });
const assistant = createAssistant({
  llm: createAnthropicLlm(config.ANTHROPIC_API_KEY),
  model: config.ASSISTANT_MODEL,
  embedder: createVoyageEmbedder({
    apiKey: config.VOYAGE_API_KEY,
    model: config.EMBEDDING_MODEL,
    dimensions: config.EMBEDDING_DIMENSIONS,
  }),
  repository: createRetrievalRepository(database),
  maxSteps: config.ASSISTANT_MAX_STEPS,
  getTeamScope: (userId, teamId) =>
    teams.getAccessibleTeamScope(userId, teamId),
});

const price = (name: string) =>
  process.env[name] === undefined ? undefined : Number(process.env[name]);
const input = price("EVAL_PRICE_INPUT");
const output = price("EVAL_PRICE_OUTPUT");
const pricing: Pricing | undefined =
  input !== undefined && output !== undefined
    ? {
        inputPerMillion: input,
        outputPerMillion: output,
        ...(price("EVAL_PRICE_CACHE_READ") !== undefined
          ? { cacheReadPerMillion: price("EVAL_PRICE_CACHE_READ")! }
          : {}),
        ...(price("EVAL_PRICE_CACHE_WRITE") !== undefined
          ? { cacheWritePerMillion: price("EVAL_PRICE_CACHE_WRITE")! }
          : {}),
      }
    : undefined;

try {
  const results = await runEvaluation(
    questions,
    async (userEmail, request, observe) => {
      const user = await database.user.findUnique({
        where: { email: userEmail.trim().toLowerCase() },
        select: { id: true },
      });
      if (!user) throw new Error(`Unknown account in questions: ${userEmail}`);
      return assistant.chat(user.id, request, { source: observe });
    },
  );
  const report = buildReport(config.ASSISTANT_MODEL, results, pricing);
  const markdown = formatReport(report);
  console.log(markdown);
  const markdownPath = option("markdown");
  const jsonPath = option("json");
  if (markdownPath) await writeFile(markdownPath, markdown);
  if (jsonPath) await writeFile(jsonPath, JSON.stringify(report, null, 2));
} finally {
  await database.$disconnect();
}
