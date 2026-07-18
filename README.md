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
- `packages/db` — Supabase/Postgres client, types, migrations
- `packages/shared-types` — cross-app TS types
- `infra/inngest` — durable-execution functions (debounce, cleanup, reminders)

## Status

Pre-M0. Scaffold only — no implementation yet. See "Build Sequence / Milestones" in the architecture doc for what M0 covers.
