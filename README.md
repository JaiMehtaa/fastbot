# whatsapp-bot-platform

An AI-driven platform that turns a conversational, prompt-driven interview into a working WhatsApp bot for small/medium businesses — no drag-and-drop workflow builder required.

Full architecture, data model, and build sequence: [`docs/architecture.md`](./docs/architecture.md).

## Structure

- `apps/web` — Pillar 1: public site + interview agent chat
- `apps/dashboard` — Pillar 2: customer dashboard
- `apps/admin` — Pillar 3: internal admin panel / control plane
- `apps/interview-api` — Stage 1: interview agent backend
- `apps/runtime` — Stage 3: the single generic runtime engine (serves both sandbox and live traffic)
- `packages/schema` — primitive/LOB registry (source of truth)
- `packages/compiler` — Stage 2: pure validator/compiler
- `packages/eval` — confidence/eval layer (`generateWithConfidence`), the shared LLM-orchestration primitive
- `packages/synthetic-gen` — synthetic business generator + grader, for testing the interview agent without a human tester per iteration
- `packages/db` — Supabase/Postgres client, types, migrations
- `packages/shared-types` — cross-app TS types
- `infra/inngest` — durable-execution functions (debounce, cleanup, reminders)

## Status

M0 done (primitives, compiler, 21 tests). M1 in progress: `packages/eval` and `packages/synthetic-gen` are built and tested (52 tests passing workspace-wide); `apps/interview-api` itself is next. See "Build Sequence / Milestones" in the architecture doc.
