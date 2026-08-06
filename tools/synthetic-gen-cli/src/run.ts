import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpenAiClient } from "@whatsapp-bot-platform/eval";
import { createInitialState, createProductionDeps, processTurn } from "@whatsapp-bot-platform/interview-api";
import type { InterviewDeps, InterviewSessionState } from "@whatsapp-bot-platform/interview-api";
import { gradeDraftConfig, generateGroundTruthDraft, renderPersona, simulatePersonaTurn } from "@whatsapp-bot-platform/synthetic-gen";
import type { GradeReport, PersonaStyle } from "@whatsapp-bot-platform/synthetic-gen";
import type { DraftConfig, PrimitiveKey } from "@whatsapp-bot-platform/shared-types";
import { createLlmGenerateFieldValues } from "./generate-field-values.js";
import { createLlmRenderPersona, createLlmSimulatePersonaTurn } from "./persona-llm.js";

const PERSONA_STYLES: readonly PersonaStyle[] = ["clean", "verbose", "terse", "ambiguous", "contradictory"];
// A real interview finishes in well under this many turns — this is a safety
// cap against an infinite loop bug in the state machine, not an expected outcome.
const MAX_TURNS = 25;

interface CliArgs {
  primitives: PrimitiveKey[];
  vertical: string;
  count: number;
  concurrency: number;
  outDir: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match) flags.set(match[1]!, match[2]!);
  }
  const primitivesRaw = flags.get("primitives");
  if (!primitivesRaw) {
    throw new Error(
      "Usage: --primitives=business_info,catalogue,human_escalation [--vertical=\"a busy neighborhood salon\"] " +
        "[--count=3] [--concurrency=3] [--out=synthetic-gen-runs/<name>]",
    );
  }
  return {
    primitives: primitivesRaw.split(",").map((s) => s.trim()) as PrimitiveKey[],
    vertical: flags.get("vertical") ?? "a small local business",
    count: Number(flags.get("count") ?? "3"),
    concurrency: Number(flags.get("concurrency") ?? "3"),
    outDir: flags.get("out") ?? path.join("synthetic-gen-runs", new Date().toISOString().replace(/[:.]/g, "-")),
  };
}

/**
 * Bounded-concurrency map — mirrors the asyncio.Semaphore-capped pattern
 * confirmed against ~/Dolibarrnew/seed's own parallel-generation code
 * (avoids rate-limit/connection exhaustion under load), just without an
 * external dependency for something this small.
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

interface RunDeps {
  generateFieldValues: ReturnType<typeof createLlmGenerateFieldValues>;
  renderFn: ReturnType<typeof createLlmRenderPersona>;
  simulateFn: ReturnType<typeof createLlmSimulatePersonaTurn>;
  interviewDeps: InterviewDeps;
}

interface RunOutcome {
  runId: string;
  style: PersonaStyle;
  groundTruth: DraftConfig;
  material: string;
  transcript: readonly { question: string; answer: string }[];
  finalDraft: DraftConfig;
  /** true if the interview reached done:true on its own; false if MAX_TURNS was hit first (itself a finding worth surfacing) */
  finishedNaturally: boolean;
  grade: GradeReport;
}

async function runOne(index: number, args: CliArgs, deps: RunDeps): Promise<RunOutcome> {
  const runId = `run-${index}-${randomUUID().slice(0, 8)}`;
  const style = PERSONA_STYLES[index % PERSONA_STYLES.length]!;

  const groundTruth = await generateGroundTruthDraft({
    selectedPrimitives: args.primitives,
    lobKey: args.vertical,
    generateFieldValues: deps.generateFieldValues,
  });

  const profile = await renderPersona(groundTruth, style, deps.renderFn);

  let state: InterviewSessionState = createInitialState(`synthetic-${runId}`);
  const transcript: { question: string; answer: string }[] = [];
  // "hi" as the opening message — the interview's owner_info stage prompts
  // regardless of what the very first message says, matching how a real
  // conversation is kicked off (see this session's own live curl testing).
  let userText = "hi";
  let done = false;
  let turns = 0;

  while (!done && turns < MAX_TURNS) {
    const result = await processTurn(state, userText, deps.interviewDeps);
    state = result.state;
    done = result.done;
    turns += 1;
    if (done) break;

    const answer = await simulatePersonaTurn({ profile, question: result.responseText, history: transcript }, deps.simulateFn);
    transcript.push({ question: result.responseText, answer });
    userText = answer;
  }

  const finalDraft: DraftConfig = {
    draftSessionId: state.draftSessionId,
    version: 1,
    lobKey: state.lobKey,
    selectedPrimitives: state.selectedPrimitives,
    fieldValues: state.fieldValues,
  };

  return {
    runId,
    style,
    groundTruth,
    material: profile.material,
    transcript,
    finalDraft,
    finishedNaturally: done,
    grade: gradeDraftConfig(groundTruth, finalDraft),
  };
}

async function persistRun(outDir: string, outcome: RunOutcome): Promise<void> {
  const dir = path.join(outDir, outcome.runId);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dir, "ground-truth.json"), JSON.stringify(outcome.groundTruth, null, 2)),
    writeFile(path.join(dir, "material.txt"), outcome.material),
    writeFile(path.join(dir, "transcript.json"), JSON.stringify(outcome.transcript, null, 2)),
    writeFile(path.join(dir, "final-draft.json"), JSON.stringify(outcome.finalDraft, null, 2)),
    writeFile(path.join(dir, "grade.json"), JSON.stringify(outcome.grade, null, 2)),
  ]);
}

interface WeakSpot {
  field: string;
  failures: number;
  total: number;
}

interface RunSummary {
  primitives: readonly PrimitiveKey[];
  vertical: string;
  requestedRuns: number;
  completedRuns: number;
  failedRuns: number;
  finishedNaturallyCount: number;
  averageScore: number;
  weakSpots: readonly WeakSpot[];
}

function buildSummary(outcomes: readonly RunOutcome[], args: CliArgs, failedRuns: number): RunSummary {
  const averageScore = outcomes.length === 0 ? 0 : outcomes.reduce((sum, o) => sum + o.grade.score, 0) / outcomes.length;

  const tally = new Map<string, { failures: number; total: number }>();
  for (const outcome of outcomes) {
    for (const result of outcome.grade.fieldResults) {
      const key = `${result.primitiveKey}.${result.fieldKey}`;
      const entry = tally.get(key) ?? { failures: 0, total: 0 };
      entry.total += 1;
      if (result.status !== "match") entry.failures += 1;
      tally.set(key, entry);
    }
  }

  const weakSpots = [...tally.entries()]
    .map(([field, { failures, total }]) => ({ field, failures, total }))
    .filter((w) => w.failures > 0)
    .sort((a, b) => b.failures / b.total - a.failures / a.total || b.failures - a.failures);

  return {
    primitives: args.primitives,
    vertical: args.vertical,
    requestedRuns: args.count,
    completedRuns: outcomes.length,
    failedRuns,
    finishedNaturallyCount: outcomes.filter((o) => o.finishedNaturally).length,
    averageScore,
    weakSpots,
  };
}

function printSummary(summary: RunSummary): void {
  console.log("\n=== Summary ===");
  console.log(
    `Runs: ${summary.completedRuns}/${summary.requestedRuns} completed (${summary.failedRuns} failed), ` +
      `${summary.finishedNaturallyCount}/${summary.completedRuns} finished the interview naturally`,
  );
  console.log(`Average grade score: ${(summary.averageScore * 100).toFixed(1)}%`);
  if (summary.weakSpots.length === 0) {
    console.log("No recurring weak fields — every graded field matched in every run it appeared in.");
  } else {
    console.log("Weakest fields (most frequently missing/mismatched, worth investigating before shipping):");
    for (const spot of summary.weakSpots.slice(0, 10)) {
      console.log(`  - ${spot.field}: failed ${spot.failures}/${spot.total} run(s)`);
    }
  }
}

/**
 * Dev-time-only CLI: generate N synthetic ground-truth drafts for a target
 * primitive set, render each into messy persona material, simulate a full
 * conversation through the REAL LLM-backed interview pipeline
 * (apps/interview-api's actual classifier/extractor/phraser — the same
 * createProductionDeps() production traffic uses), grade the result against
 * ground truth, and report weak spots. Never imported by
 * apps/interview-api/apps/runtime's own production paths — this only ever
 * runs by hand, from the command line, to stress-test a primitive before it
 * ships or after a prompt change.
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });

  const client = createOpenAiClient();
  const productionDeps = createProductionDeps({});
  const interviewDeps: InterviewDeps = {
    classifyFn: productionDeps.classifyFn,
    extractFn: productionDeps.extractFn,
    extractOwnerInfoFn: productionDeps.extractOwnerInfoFn,
    // Synthetic personas have no real website — skip the real network call rather
    // than let the scraper try to fetch whatever a persona happens to invent.
    scrapeFn: async () => ({ status: "unreachable" as const, reason: "synthetic run — scraping disabled" }),
    phraseFn: productionDeps.phraseFn,
  };

  const deps: RunDeps = {
    generateFieldValues: createLlmGenerateFieldValues(client, args.vertical),
    renderFn: createLlmRenderPersona(client),
    simulateFn: createLlmSimulatePersonaTurn(client),
    interviewDeps,
  };

  console.log(`Generating ${args.count} synthetic run(s) for [${args.primitives.join(", ")}] (concurrency ${args.concurrency})`);
  console.log(`Vertical: "${args.vertical}"`);
  console.log(`Output: ${args.outDir}\n`);

  const indices = Array.from({ length: args.count }, (_, i) => i);
  let failedRuns = 0;

  const outcomes = await runWithConcurrency(indices, args.concurrency, async (index): Promise<RunOutcome | null> => {
    console.log(`  [${index}] starting (${PERSONA_STYLES[index % PERSONA_STYLES.length]} persona)...`);
    try {
      const outcome = await runOne(index, args, deps);
      await persistRun(args.outDir, outcome);
      const pct = (outcome.grade.score * 100).toFixed(0);
      const naturalNote = outcome.finishedNaturally ? "" : " — hit MAX_TURNS, did not finish naturally";
      console.log(`  [${index}] done — score ${pct}% (${outcome.grade.matchedCount}/${outcome.grade.totalCount})${naturalNote}`);
      return outcome;
    } catch (error) {
      failedRuns += 1;
      console.error(`  [${index}] FAILED: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  const successful = outcomes.filter((o): o is RunOutcome => o !== null);
  const summary = buildSummary(successful, args, failedRuns);
  await writeFile(path.join(args.outDir, "summary.json"), JSON.stringify(summary, null, 2));
  printSummary(summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
