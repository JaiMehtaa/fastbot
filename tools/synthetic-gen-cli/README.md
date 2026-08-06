# synthetic-gen-cli

Dev-time-only CLI: generate → simulate → grade. Stress-tests a primitive combination against the **real** LLM-backed interview pipeline (the same `createProductionDeps()` production traffic uses) before it ships, or after a prompt/schema change.

For each run:
1. **Generate** a valid ground-truth `DraftConfig` for the requested primitives (`packages/synthetic-gen`'s `generateGroundTruthDraft`, backed by a real OpenAI call per primitive, validated against `packages/compiler`'s `validateDraft`).
2. **Render** it into messy, natural-language persona material (never the structured data itself).
3. **Simulate** a full conversation by driving `apps/interview-api`'s real `processTurn()` state machine, with the persona answering from its rendered material only.
4. **Grade** the interview's resulting draft against the ground truth (`gradeDraftConfig`).

Every run's ground truth, persona material, full transcript, final draft, and grade are persisted to disk; a `summary.json` aggregates average score and the fields that failed most often across runs.

Never imported by `apps/interview-api`/`apps/runtime`'s production code — this only ever runs by hand.

## Requirements

- `OPENAI_API_KEY` (real calls — generation, persona simulation, and the interview's own classify/extract/phrase steps all cost real tokens)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (the real interview pipeline resolves its prompts from the DB and needs a session store; a local `supabase start` stack is enough)

## Usage

```sh
pnpm --filter @whatsapp-bot-platform/synthetic-gen-cli build
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node --env-file=.env.local dist/run.js \
  --primitives=business_info,catalogue,human_escalation \
  --vertical="a busy neighborhood salon" \
  --count=5 \
  --concurrency=3 \
  --out=synthetic-gen-runs/catalogue-check
```

| Flag | Default | Meaning |
|---|---|---|
| `--primitives` | *(required)* | Comma-separated `PrimitiveKey` list to test |
| `--vertical` | `"a small local business"` | Free-text business type fed to generation/persona rendering |
| `--count` | `3` | Number of independent synthetic runs |
| `--concurrency` | `3` | Max runs in flight at once (bounded, not `Promise.all`) |
| `--out` | `synthetic-gen-runs/<timestamp>` | Output directory |

A low average score, or a field showing up repeatedly in `weakSpots`, means the interview is systematically failing to extract or ask for that field — worth reading the transcripts in the failing runs' directories before shipping.
