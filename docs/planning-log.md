# Planning Log — AI-Driven WhatsApp Bot Builder

A chronological record of how this project's architecture and decisions came together. Complements `docs/architecture.md` (the technical reference) by capturing the *reasoning* — why things were decided, what was rejected and why — which doesn't otherwise live in the code.

---

## 1. Origin: reverse-engineering Pittie Group's n8n bot

Started by reading `/Users/jaimehta/Documents/N8N workflow/Consumer BOT DEPLOYED.json` — a real, deployed WhatsApp bot for Pittie Group (~111 nodes) covering brands Zap, Bodify, Chakaachak, Shubhkart. Key patterns identified:

- WhatsApp Cloud API (Meta Graph API) inbound webhook + outbound send, Supabase (Postgres) backend
- A `users` table keyed by `wa_id` holding `current_state`/`current_brand`; a `chat_history` table logging every message
- A "State Router" switch dispatching on `current_state`; every response follows a **send → log → set-state** triplet
- A "Brand Logic Engine" — one large hardcoded Code node mapping button/list-reply IDs to a per-brand catalogue of products/links — this is the entire product catalogue and site map for all four brands, hand-authored
- 24h session expiry, free-text debounce (wait 8s, re-check still-latest before responding), a LangChain support-escalation sub-flow (reads last 30 messages, creates tickets or replies conversationally)

**Core insight that shaped everything after**: the Brand Logic Engine is hardcoded per business. The whole point of the new product is turning that into a **generic interpreter driven by structured config data**, so one runtime serves any business instead of one engine per client.

---

## 2. Ideation: from "WhatsApp bot builder" to "logic-definition-as-a-service"

The user's idea evolved through several framings, each a real sharpening:

1. **Initial pitch**: a platform letting SMBs build WhatsApp chatbots via a prompt, "easily configurable without much settings," integrated with WordPress/Shopify.
2. **Market reality check**: Wati, AiSensy, Interakt, Gallabox already occupy "WhatsApp bot builder for SMBs" — but all of them are drag-and-drop-first. The user's sharper framing: an AI agent conversationally interviews the business, cross-questions until an SOP checklist is filled, emits a structured config — the wedge is *eliminating manual setup entirely*, not adding features to a drag-and-drop tool.
3. **Rejected idea, explicitly**: "prompt generates the whole workflow" was flagged as too risky/brittle. Landed instead on: LLM's job is narrow (extract structured data through dialogue), a deterministic compiler renders that data into a working bot. This distinction became the load-bearing principle for the rest of the architecture.
4. **Bigger reframe**: not "we build WhatsApp bots" but "we resolve the problem of defining business logic," sold as infrastructure — an embeddable widget/API that no-code platforms (Lovable, Bolt, etc.) and their end-users can plug into, WhatsApp being the first channel/rendering target, not the whole product. Explicitly clarified: this means partnering as an *infra layer* those platforms consume, not letting their code-gen write the bot's logic (which would reintroduce the per-tenant-hardcoded-logic trap).
5. **Differentiator sharpened further**: "autotune via prompt" — ongoing conversational reconfiguration ("add a Diwali offer," "change my hours"), not just one-time onboarding. This only works because the architecture is config-driven, not code-generating — confirmed the compiler-based approach was the right call.
6. **GTM sequencing**: outsource WhatsApp channel access to a BSP (360dialog primary, Twilio fallback for the sandbox number specifically) rather than pursuing Meta Tech Provider / Embedded Signup status directly — defers a real approval-process blocker without blocking product engineering.

---

## 3. First `/plan` session: the Four-Pillar architecture

User's framing: "we cannot be taking on blockers initially and then working on the system" — defer BSP/WhatsApp entirely, plan the buildable core first.

**Initial plan draft covered only three surfaces** (public site, customer dashboard, live deployment) — the user corrected this explicitly: there are **four pillars**, the missing one being an internal **admin panel** that needed to be "even more strong" — a real control plane (primitive/LOB registry visibility as it grows, cross-tenant ops view, platform health monitoring, cross-tenant escalation oversight, manual intervention tools), not a thin monitoring page.

**Key architectural rule locked in**: there is exactly one runtime engine, and it never branches on "is this a draft being tested or a live tenant" — context resolution (webhook → `{context_type, context_id, compiled_config}`) is the only place that distinction exists. This is what makes the shared sandbox WhatsApp number, dashboard re-testing, and live traffic all serve through identical code.

Also decided in this session:
- **Not n8n for production** — dedicated TypeScript backend + Inngest (durable execution, chosen over Temporal for MVP — no server to operate) + Supabase/Postgres (kept, it's a legitimately good SaaS backend, not just an n8n convenience)
- **Three-stage pipeline**: Interview Agent (Stage 1, LLM → structured config only) → Compiler/Validator (Stage 2, pure/deterministic) → Runtime Engine (Stage 3, generic interpreter)
- **Primitives, not per-LOB templates**: composable building blocks (`business_info`, `catalogue`, `offers`, `faq_support`, `human_escalation`, `lead_capture`, `booking`, `order_management`); a LOB is a "recipe" selecting and configuring a set of these
- **First LOB left open** (retail/D2C recommended as lowest-risk, since Pittie already proves those primitives) — never fully locked, still an open decision
- Full data model, BSP recommendation, sandbox-number multiplexing mechanism (join-token via `wa.me` deep link), milestone sequence M0–M6, and the initial repo folder structure were all designed and written into the plan file.

**Then**: user asked to scaffold the actual work folder and push to git — validated as the right move, plan mode exited, repo built.

---

## 4. Repo scaffold + M0 implementation

Built `/Users/jaimehta/whatsapp-bot-platform` — pnpm workspace monorepo, `git init`, initial commit with placeholder `package.json`/README per module (`apps/web`, `apps/dashboard`, `apps/admin`, `apps/interview-api`, `apps/runtime`, `packages/schema`, `packages/compiler`, `packages/db`, `packages/shared-types`, `infra/inngest`) and `docs/architecture.md` copying the full plan in as the living reference.

**M0 implemented for real** (not just scaffolded):
- `packages/shared-types` — `PrimitiveSchema`, `DraftConfig`, `CompiledConfig`, `ValidationResult`, runtime types
- `packages/schema` — the actual `primitive_registry`: `business_info`, `catalogue`, `faq_support`, `human_escalation`, plus `retail_d2c`/`minimal_support` LOB recipes
- `packages/compiler` — pure, LLM-free `validateField`/`validateDraft`/`compile`, including the catalogue-needs-≥1-item and booking-needs-`business_info.hours` cross-primitive checks
- 13 unit tests, all passing

**Real gotcha hit and fixed**: Node 24 runs `.ts` directly via native type-stripping, but source uses NodeNext-style `.js` import specifiers (correct for compiled output) — these don't resolve against raw `.ts` files. Fixed by compiling first (`tsc -b`) then testing against `dist/`, documented in the commit so it doesn't get "fixed" backward later.

---

## 5. Round check — honest confidence scoring, two gaps found and fixed

User asked for a confidence-scored self-review of both the plan and the implementation. Verified rather than assumed (re-ran tests, grepped for untested paths) before scoring. Findings:

- Plan-level: core architecture 9/10 (grounded in Pittie precedent), BSP/sandbox mechanism 6/10 (explicitly unverified), schema versioning 3/10 (known unsolved gap)
- Implementation-level: compiler core 8/10, but found two real gaps:
  1. **No structural check preventing two primitives from sharing a state name** — `compile()`'s `stateTable[state] = ...` would silently overwrite on collision, no guard, no test
  2. **No test for an optional field being present-but-invalid** (only required-field paths were tested)

**Both fixed same session**: extracted `assignStateTableEntry()` (throws loudly on cross-primitive state collision) in `packages/compiler`, added `checkRegistryConsistency()` (static whole-registry check) in `packages/schema`, added the missing optional-field test. 21 tests passing, committed.

---

## 6. Second `/plan` session: RAG, LLM provider, and the confidence/eval layer

User asked how the chatbot's "understanding" would actually work — RAG or not. Walked through every LLM touchpoint in the system and found each one operates on data that structurally fits in context (selected primitive schema for interview extraction, one tenant's FAQ list for fallback, all LOB classification examples, last ~30 messages for escalation) — **RAG decision: no RAG for MVP**, revisit only if a future document-upload primitive introduces a genuinely large corpus (`pgvector` via Supabase then, additive not a rearchitecture).

**LLM provider: OpenRouter** — matches the Pittie reference, avoids a second vendor integration, keeps model choice flexible (strong model for generation, cheap model for judging).

User then raised a real production concern: shouldn't the system score confidence and regenerate/escalate on low confidence, "or work like an eval"? Clarified "bedrock" meant *foundational*, not AWS Bedrock specifically. Designed a new shared package, **`packages/eval`**, providing one `generateWithConfidence()` primitive used by every LLM call site — mirrors how `packages/compiler` is the one shared deterministic layer, deliberately kept separate from it (compiler stays LLM-free by design).

Per call site:
- `faq_support` fallback: separate judge call (self-rating is poorly calibrated; this is customer-facing, worth the extra call) — on repeated low confidence, routes straight to `human_escalation` rather than showing an uncertain answer
- Interview field extraction: cheap self-reported confidence; a low-confidence field just isn't committed, reusing the existing missing-field-driven interview loop instead of an in-turn regeneration
- LOB classification: self-reported confidence; formalizes the already-planned "ask one clarifying question on ambiguity" behavior under the same shared mechanism

All of this was written into `docs/architecture.md` and the plan file, plan mode exited/approved.

---

## 7. Tangent: RAG vs. RL environments

User asked what's "better than RAG — RL environments or OKF" (OKF never clarified). Answered: RAG and RL aren't substitutes — RAG is an inference-time knowledge-access mechanism, RL is a training-time behavior-improvement technique. For this system's actual gap (bot doesn't know a specific tenant's FAQ/hours), that's a knowledge-access problem, not a behavior problem — RAG/context-stuffing is the right tool, not RL. RL becomes a legitimate lever later (v2+, once there's real usage data to define a reward signal against, e.g. improving the interview agent's conversational judgment) but would be premature pre-launch with no production conversations yet.

---

## 8. Synthetic-business-generator: validated one idea, pushed back on another

User proposed reusing the Dolibarrnew/Frappebooks synthetic-data-generation methodology (LLM + `instructor`-style structured output + retry loops) to build synthetic businesses that verify the interview→compiler→runtime flow end-to-end, *and* have small "flows" (primitives) automatically join into complete flows via embeddings.

**Split into two, judged separately**:
- **Synthetic-data verification loop — validated and scoped.** Directly extends proven methodology from Spree/Frappebooks. This became the concrete M1 sub-scope below.
- **Embedding-based auto-composition of primitives — pushed back on explicitly.** Reasoning: embeddings measure semantic similarity of text, not functional compatibility of components. The system already has a concrete example of why this matters — `booking` requires `business_info.hours` to be present, a hard constraint hand-coded in `validateDraft` and unit-tested. An embedding-based composer would either have to silently re-derive that same constraint (gaining nothing) or produce broken bots when it doesn't. This is the same shape of risk explicitly ruled out at the very start of ideation ("prompt generates the workflow" vs. "agent extracts data, deterministic compiler renders it") — auto-composing primitives via embeddings at runtime is workflow-generation-via-LLM wearing a different hat. Proposed a narrower, sound version instead: embeddings as an *offline recipe-discovery aid* (cluster real free-text descriptions that fall through to `minimal_support` to surface patterns worth a human-authored `lob_recipes` entry) — the deterministic, tested registry stays the actual source of truth.

---

## 9. Synthetic-business-generator: M1 scope (in progress when this log was written)

New package, `packages/synthetic-gen`, an M1 prerequisite alongside `packages/eval`:

- `ground-truth-generator.ts` — LLM generates a *valid* `DraftConfig` for a chosen LOB recipe (validated against `packages/compiler`'s `validateDraft`, retry-on-invalid up to 3 attempts — the TS equivalent of the `instructor` + retry pattern)
- `persona-renderer.ts` — takes that ground-truth config + a "style" parameter, produces deliberately messy natural-language material (shuffled order, omitted-until-asked fields, colloquial phrasing) — not a verbatim readout
- `persona-simulator.ts` — turn-by-turn business-owner roleplay sourced only from the messy rendering, never the structured ground truth directly, so the interview agent has to do real extraction work
- `grader.ts` — compares the interview's final `DraftConfig` against ground truth, field-by-field
- `scenarios.ts` — curated adversarial cases (ambiguous LOB description, a field phrased to trigger low confidence on purpose, contradict-then-correct) that specifically stress-test `packages/eval`'s gating logic, not just the happy path

CI strategy mirrors the plan's mock-BSP-adapter approach for M2: curated scenarios run every CI run (fast, cheap); the larger LLM-generated regression suite runs nightly/on-demand given real API cost.

**Status at time of writing**: this design was proposed in chat and is being written into `docs/architecture.md` — not yet fully saved to that file, and `packages/synthetic-gen` is not yet built.

---

## Where things stand right now

- **Repo**: `/Users/jaimehta/whatsapp-bot-platform`, 3 commits, not yet pushed to any remote (destination still undecided — personal GitHub vs. org, visibility, repo name)
- **M0**: done, implemented, tested (21 tests), committed
- **M1**: in progress — `packages/eval` and `packages/synthetic-gen` designed but not yet built; the interview agent itself not started
- **Open decisions not yet locked**: first LOB to build fully (retail/D2C recommended, unconfirmed against a real pilot business), `generateWithConfidence()`'s actual threshold/max-attempt values (provisional, need real transcripts to calibrate)
