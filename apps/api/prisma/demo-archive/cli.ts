import path from "node:path";
import { fileURLToPath } from "node:url";
import { corpus } from "./model.js";
import {
  assertOfflineEnvironment,
  ownedOutputPath,
  ownedEvidencePath,
} from "./policy.js";

export type Command = "plan" | "build" | "validate" | "pack" | "import";
export type Invocation = {
  command: Command;
  output?: string;
  input?: string;
  expectedSha256?: string;
  confirm?: string;
  receipt?: string;
  evidence?: string;
  pilot: boolean;
  dryRun: boolean;
};
type Runtime = {
  env: NodeJS.ProcessEnv;
  print: (text: string) => void;
  dispatch?: (invocation: Invocation) => Promise<void>;
};
const help = `${corpus.agency}: opt-in archive tooling
${corpus.notice}
Commands: inspect, plan, build, validate, pack, import
Write commands require an explicit --output out/agency-demo-archive/... path.
Import requires --input, --expected-sha256 and, unless --dry-run, --confirm agency_demo_archive.
No root .env loading. No implicit database connection.
Native Word layout is unverified. Full build requires digest-matched pilot approval.
Writing import additionally requires a verified task-owned container, offline app confirmation and ten process-only password inputs.`;

export async function runCli(args: string[], runtime: Runtime): Promise<void> {
  assertOfflineEnvironment(runtime.env);
  if (!args.length || (args.length === 1 && args[0] === "--help")) {
    runtime.print(help);
    return;
  }
  if (args.length === 1 && args[0] === "inspect") {
    runtime.print(JSON.stringify(corpus, null, 2));
    return;
  }
  const command = args[0];
  if (!["plan", "build", "validate", "pack", "import"].includes(command ?? ""))
    throw new Error("Unknown archive command.");
  const flags = new Map<string, string | true>();
  const allowed: Record<string, string[]> = {
    plan: ["--output", "--dry-run"],
    build: ["--output", "--dry-run", "--pilot"],
    validate: ["--input", "--evidence"],
    pack: ["--input", "--output", "--receipt", "--dry-run"],
    import: ["--input", "--expected-sha256", "--confirm", "--dry-run"],
  };
  for (let i = 1; i < args.length; i++) {
    const flag = args[i]!;
    if (!allowed[command!]!.includes(flag) || flags.has(flag))
      throw new Error("Unknown or repeated archive flag.");
    if (["--dry-run", "--pilot"].includes(flag)) flags.set(flag, true);
    else {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error("Archive flag requires a value.");
      flags.set(flag, value);
    }
  }
  const stringFlag = (name: string): string | undefined => {
    const value = flags.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const invocation: Invocation = {
    command: command as Command,
    pilot: flags.has("--pilot"),
    dryRun: flags.has("--dry-run"),
  };
  if (["plan", "build", "pack"].includes(command!)) {
    const output = stringFlag("--output");
    if (!output) throw new Error("Explicit owned --output required.");
    invocation.output = ownedOutputPath(output);
  }
  if (["validate", "pack", "import"].includes(command!)) {
    const input = stringFlag("--input");
    if (!input) throw new Error("Explicit owned --input required.");
    invocation.input = ownedOutputPath(input);
  }
  if (command === "import") {
    const digest = stringFlag("--expected-sha256");
    if (!digest || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Externally pinned ZIP SHA-256 required.");
    invocation.expectedSha256 = digest;
    invocation.confirm = stringFlag("--confirm");
    if (!invocation.dryRun && invocation.confirm !== "agency_demo_archive")
      throw new Error("Explicit disposable demo confirmation required.");
    if (!invocation.dryRun) {
      const { importArchive } = await import("./persistence/import.js");
      await importArchive(
        invocation.input!,
        digest,
        invocation.confirm!,
        runtime.env,
      );
      runtime.print(
        "Archive imported atomically into the guarded disposable database; existing credentials and sessions preserved.",
      );
      return;
    }
    const { preflightArchive } = await import("./persistence/preflight.js");
    await preflightArchive(invocation.input!, digest);
    runtime.print(
      "Offline archive preflight passed under the external digest; zero database calls. Database target/conflict checks remain separate.",
    );
    return;
  }
  if (command === "pack") {
    const receipt = stringFlag("--receipt");
    if (!receipt) throw new Error("Explicit external --receipt required.");
    invocation.receipt = ownedEvidencePath(receipt);
  }
  if (command === "validate" && stringFlag("--evidence"))
    invocation.evidence = ownedEvidencePath(stringFlag("--evidence")!);
  if (invocation.dryRun) {
    runtime.print(
      "Offline invocation accepted; content not validated and no files written.",
    );
    return;
  }
  if (!runtime.dispatch && invocation.command === "build" && invocation.pilot) {
    const { buildPilot } = await import("./qa/pilot.js");
    await buildPilot(invocation.output!);
    runtime.print(
      "Pilot originals rendered; independent raster and complete-pack review gates remain pending.",
    );
    return;
  }
  if (!runtime.dispatch && invocation.command === "plan") {
    const { writeCorpusPlan } = await import("./compiler.js");
    await writeCorpusPlan(invocation.output!);
    runtime.print(
      "Offline inventory written; no originals rendered and no database opened.",
    );
    return;
  }
  if (!runtime.dispatch && invocation.command === "build") {
    const { buildCorpus } = await import("./build.js");
    await buildCorpus(invocation.output!);
    runtime.print(
      "All originals built under bounded policy; full validation and downstream release gates remain required.",
    );
    return;
  }
  if (!runtime.dispatch && invocation.command === "validate") {
    const { validateCorpus } = await import("./validate.js");
    await validateCorpus(invocation.input!, invocation.evidence);
    runtime.print(
      "All originals and exact public payload validated offline; no database opened.",
    );
    return;
  }
  if (!runtime.dispatch && invocation.command === "pack") {
    const { packCorpus } = await import("./archive/pack.js");
    await packCorpus(
      invocation.input!,
      invocation.output!,
      invocation.receipt!,
    );
    runtime.print(
      "Portable ZIP and external digest receipt created; downstream import/API/browser acceptance is not implied.",
    );
    return;
  }
  if (!runtime.dispatch)
    throw new Error("Archive handler not implemented; no files written.");
  await runtime.dispatch(invocation);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runCli(process.argv.slice(2), {
      env: process.env,
      print: (text) => console.log(text),
    });
  } catch {
    // Do not print raw errors: later adapters may attach URLs or credentials.
    console.error(
      "Archive command refused or failed. No release acceptance is implied.",
    );
    process.exitCode = 1;
  }
}
