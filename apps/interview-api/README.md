# apps/interview-api — Stage 1: Interview Agent Backend

Runs the conversational interview that turns free text into a structured `draft_configs` row. The LLM never decides what's required — `packages/schema`'s primitive definitions do.

- **`lob-classifier.ts`** — `classifyLob()`: a single classification attempt per turn against `packages/schema`'s real `lob_recipes`, routed through `packages/eval`'s `generateWithConfidence()` (with `maxAttempts: 1` — the "ask a clarifying question, then fall back" retry spans multiple *conversational* turns, which doesn't fit `generateWithConfidence`'s same-turn regeneration model, so that behavior lives in session state instead).
- **`field-extractor.ts`** — `extractFields()`: extracts zero or more fields from one message (a single reply can answer several fields at once), each with its own self-reported confidence. Low-confidence fields simply aren't committed — no retry call, they just stay missing and get asked again next turn. Deliberately does *not* route through `generateWithConfidence` (no single output to gate — see the file's own comment for why, same kind of documented scope boundary as `packages/synthetic-gen`'s `persona.ts`).
- **`interview-session.ts`** — `processTurn()`: the actual turn-handling state machine. Re-runs `packages/compiler`'s `validateDraft` from stored `field_values` on *every* turn rather than tracking conversation history — this is what makes a resumed session's "what's left" correct without replaying anything. Termination is a deterministic keyword match on an explicit "does this look right?" confirmation, never an LLM guess that the interview is done.
- **`server.ts`** — Fastify skeleton (`GET /health`); no HTTP route wired to `processTurn()` yet.

**What's real vs. placeholder**: the state machine, validation wiring, and confidence gating are real and tested (16 tests, including a full classify → extract → summarize → confirm happy path). `interview-session.ts`'s `buildSummary()`/clarifying-question text and the injected `classifyFn`/`extractFn` themselves are functional placeholders — they prove the mechanics work, but the actual conversational tone/wording ("the chatbot's voice") and the real OpenRouter-backed classify/extract implementations are separate, collaborative work not built here.

See `/docs/architecture.md` for full system design.
