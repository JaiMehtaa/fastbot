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

- **M0**: done — primitives, compiler.
- **M1 foundations**: done — `packages/eval` (confidence/eval layer) and `packages/synthetic-gen` (synthetic business generator) built and tested.
- **M2 core logic**: done ahead of schedule — `apps/runtime`'s context resolver, generic interpreter, primitive handlers, and full inbound pipeline are real and tested (35 tests), running against a mock BSP adapter and an in-memory repository since no BSP account or Supabase project exists yet.
- **App skeletons**: `apps/web`, `apps/dashboard`, `apps/admin` (Next.js) and `apps/interview-api` (Fastify) all boot and build. No real UI or interview-agent conversation logic yet — deliberately deferred as separate, collaborative work.
- **93 tests passing workspace-wide.**
- **Not yet started**: the interview agent's actual conversational logic (`apps/interview-api`), a real Supabase-backed `RuntimeRepository`, a real BSP-backed adapter, durable execution (`infra/inngest`) wiring for debounce.

See "Build Sequence / Milestones" in `docs/architecture.md`, and `docs/planning-log.md` for the reasoning behind how this came together.
