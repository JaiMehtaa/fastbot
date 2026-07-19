# apps/runtime — Stage 3: Runtime Engine

Fastify service. The single generic interpreter. Serves BOTH sandbox draft traffic and live tenant traffic through the identical code path — the only place those two ever differ is context resolution. **Built and tested (35 tests) — real logic, not a stub**, but only wired against fakes so far: no live BSP account or Supabase project exists yet.

- **`webhook-payload.ts`** — parses Meta's raw webhook JSON (matches the Pittie reference workflow's observed shape) into `InboundMessage` / status events.
- **`context-resolver.ts`** — `resolveContext()`: `phone_number_id` → `tenants` lookup (live), or the pooled sandbox number → bound-draft lookup. `handleSandboxJoin()`: parses "JOIN &lt;token&gt;" and binds a `wa_id` to a draft session.
- **`interpreter.ts`** — `createInterpreter()`: `compiled_config.state_table[current_state]` → primitive_key → dispatch to a generic per-primitive handler (`handlers/*.ts`), parameterized entirely by that tenant's compiled block. **No per-tenant bespoke code, ever.** A handler may hand off to another primitive's state with no payload (e.g. `faq_support`'s low-confidence fallback → `human_escalation`) — the interpreter chases that chain generically rather than any handler special-casing another.
- **`handlers/`** — `business_info`, `catalogue`, `faq_support`, `human_escalation`, one per MVP primitive, implementing exactly the `renderer_contract` each primitive's schema (`packages/schema`) already specifies.
- **`process-inbound-message.ts`** — the full inbound path: context resolution → 24h expiry check → interpreter → send→log→set-state triplet → escalation side effects (ticket + dashboard notification, tenant contexts only — drafts have no tenant to notify).
- **`repository.ts`** — `RuntimeRepository` interface abstracting every DB access the runtime needs, plus `createInMemoryRepository()` for tests. A real `packages/db`-backed implementation is a direct, mechanical follow-up once a Supabase project exists — not a redesign.
- **`bsp-adapter.ts`** — `BspAdapter` interface plus `createMockBspAdapter()` (in-memory, records sent messages). No real 360dialog/Twilio adapter exists yet — same "wired, not live" pattern as `packages/eval`'s OpenRouter client.
- **`server.ts`** — Fastify app factory (`createServer(deps)`, dependency-injected — testable via `.inject()`, no port bound in tests). `POST /webhook`, `GET /health`.

**Still missing before this runs live**: a real `RuntimeRepository` (Supabase-backed) and a real `BspAdapter` (360dialog-backed) — both need credentials that don't exist yet. Free-text debounce (durable execution via `infra/inngest`) also isn't wired in yet; `process-inbound-message.ts` processes each inbound message immediately rather than waiting 8s for a burst to settle.

See `/docs/architecture.md` for full system design.
