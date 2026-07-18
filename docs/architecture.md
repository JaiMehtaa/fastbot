# AI-Driven WhatsApp Bot Builder — MVP Plan

## Context

Small business WhatsApp bot builders today (Wati, AiSensy, Interakt, Gallabox) are all manual drag-and-drop tools — every menu, button, and flow has to be hand-wired by the business owner. The goal here is to replace that with a conversational, prompt-driven build: a business describes itself in a chat, an AI interviewer cross-questions until it has everything needed, and a working WhatsApp bot comes out the other end — no drag-and-drop, minimal manual configuration.

This was scoped against a real reference artifact: Pittie Group's deployed n8n WhatsApp bot ("Consumer BOT DEPLOYED," ~111 nodes). Its state-machine pattern (Supabase-backed `users`/`chat_history`, a state-router switch, a hardcoded per-brand "Brand Logic Engine," 24h session expiry, free-text debounce, LangChain support escalation) is a proven design — but it's hardcoded per business. The core insight driving this whole plan: **that hardcoded logic must become a generic interpreter driven by structured config data**, so one runtime engine can serve any business instead of one engine per client.

The MVP is scoped narrow on purpose: one LOB, one BSP (outsourced WhatsApp channel access, not direct Meta Tech Provider status), Node/TypeScript end-to-end, proving prompt → structured config → real working WhatsApp bot before expanding to multi-channel or embeddable SDKs (those are explicitly future scope, not part of this build).

**Critical scope correction from initial pass**: the first draft of this plan only covered the prospect-facing funnel (marketing site → interview → sandbox test → connect number). It missed that there are **four distinct pillars** to build, not one funnel — most importantly an authenticated customer dashboard, and a genuinely strong internal admin panel that acts as the platform's control plane (not a thin monitoring afterthought). Both are included below as first-class parts of the MVP.

---

## Architecture: Four Pillars

1. **Public web page (unauthenticated)** — pricing/value prop plus the interview-agent chat in one place. A prospect builds and sandbox-tests a bot here with zero signup friction.
2. **Customer dashboard (logged-in)** — where a signed-up business lives day to day: plan/billing, bot editor ("iterate"), re-test via sandbox ("check the flow"), escalations/discrepancies feed, connect-your-number action.
3. **Admin panel (internal, our team only)** — the platform's control plane: full visibility into the primitive/LOB registry as it grows, cross-tenant operations view, platform health (BSP/sandbox number monitoring), cross-tenant escalation oversight, manual intervention tools. Separately authenticated from customer accounts — this is effectively a second application alongside the customer-facing product, not a bolt-on page.
4. **Live WhatsApp deployment** — the runtime serving real end-customers on a business's connected number.

The architectural rule tying all four together: **there is exactly one runtime engine**, and it never branches on "is this a draft being tested, or a live tenant." Context resolution (inbound webhook → `{context_type, context_id, compiled_config}`) is the only place that distinction exists — state machine, primitive handlers, and the send→log→set-state triplet are identical code whether the traffic is a prospect testing on the shared sandbox number, a signed-up customer re-testing an edit, or a real end-customer messaging the live number. The admin panel (pillar 3) is the one pillar that sits outside this flow — it's a cross-cutting observability/control layer reading from every other pillar's data, not part of the linear prospect→customer path.

```
 PILLAR 1: Public web page (pricing + interview agent, one page)
        │
        ▼
 Interview Agent chat (Stage 1, anonymous) ──► Compiler/Validator (Stage 2)
        │                                              │
        ▼                                              ▼
 draft_sessions / draft_configs  ◄──────────── primitive_registry (schemas) ◄─┐
        │                                                                      │
        │ "Test on WhatsApp" (wa.me deep link + join token)                    │
        ▼                                                                      │
 Shared pooled sandbox WhatsApp number ──► RUNTIME ENGINE (Stage 3) ──┐        │
                                                                        │        │
        (prospect signs up, picks plan)                                │ same   │
        │                                                               │ engine,│
        ▼                                                               │ context│
 PILLAR 2: Customer Dashboard                                           │-resolved│
   - plan/billing          - bot editor (interview agent, scoped)       │        │
   - re-test on sandbox ───────────────────────────────────────────────┘        │
   - escalations/discrepancies feed ─────────────┐                              │
   - conversation history viewer                  │                              │
        │                                          │                              │
        │ "Connect your WhatsApp number" (BSP)     │                              │
        ▼                                          ▼                              │
 tenants / tenant_configs (promoted) ──────► dashboard_notifications              │
        │                                    (rolls up cross-tenant)              │
        ▼                                          │                              │
 PILLAR 4: Live WhatsApp deployment                 │                              │
   RUNTIME ENGINE (Stage 3, same code path)         │                              │
   serving real end-customers                       │                              │
                                                      ▼                              │
                                        PILLAR 3: Admin Panel (internal) ───────────┘
                                          - primitive/LOB registry view
                                          - cross-tenant ops view
                                          - platform health / BSP monitoring
                                          - cross-tenant escalation oversight
                                          - manual intervention tools
```

---

## First-Draft Primitive List

Primitives are composable building blocks; a business's "LOB" is really just a recipe selecting and configuring a set of these. Grounded in what Pittie already proves vs. genuinely new:

| Primitive | Purpose | Status |
|---|---|---|
| `business_info` | Hours, location, contact, policies | Proven (Pittie) |
| `catalogue` | Products/brands/categories with links | Proven (Brand Logic Engine) |
| `offers` | Promotions — can likely fold into `catalogue` as a "featured" flag rather than a separate primitive, to cut MVP surface area | Proven, foldable |
| `faq_support` | Canned Q&A + bounded LLM fallback | Proven-ish |
| `human_escalation` | Ticket creation / handoff to a person | Proven pattern, simplify vs. Pittie's LangChain agent |
| `lead_capture` | Multi-turn name/phone/interest collection | Net-new, low complexity |
| `booking` | Service → date → time → confirm → reminder | Net-new, highest complexity (needs durable execution for slot holds/reminders) |
| `order_management` | Order status / cart | Proven-ish in Pittie but pulls in inventory/payment — recommend deferring past MVP |

**First LOB to build end-to-end: still open.** Retail/D2C (`business_info` + `catalogue` + `faq_support` + `human_escalation`) is the lowest-risk starting point since every primitive it needs is already proven — it isolates risk to the genuinely new work (interview agent, compiler, dashboard, sandbox multiplexing). If bookings are the real go-to-market wedge, that's a legitimate reason to front-load `booking` instead, at the cost of stacking its durable-execution complexity on top of everything else that's new. This should be settled against whichever business is the actual first pilot candidate, not decided in the abstract — flagged as the one open decision this plan doesn't lock.

---

## Data Model (conceptual)

**Prospect/build-time:**
- `draft_sessions` — `id`, `status` (in_progress/testing/promoted/abandoned/expired), `owner_contact` (optional, pre-signup)
- `draft_configs` — `draft_session_id`, `version`, `lob_key`, `selected_primitives`, `field_values` (jsonb), `last_validation` (jsonb)
- `primitive_registry` — `primitive_key`, `schema_version`, `json_schema`, `interview_hints`, `renderer_contract`, `state_contract`
- `lob_recipes` — `lob_key`, `default_primitive_set`, `classification_examples`
- `draft_wa_bindings` — sandbox multiplexing: `token`, `draft_session_id`, `wa_id` (nullable until bound), `status`, `expires_at`

**Account/dashboard:**
- `accounts` — login identity (Supabase Auth)
- `account_tenants` — maps account → tenant (1:1 for MVP; shaped so 1:many, e.g. an agency managing several businesses, is possible later without a schema change)
- `dashboard_notifications` — `tenant_id`, `type` (escalation / delivery_failure / config_validation_warning), `ref_id` (points into `support_tickets` or `chat_history`), `status` (unread/read/resolved), `created_at` — this is what powers the escalations/discrepancies feed
- `support_tickets` — `context_type/context_id`, `wa_id`, `summary`, `status`

**Live tenant:**
- `tenants` — `id`, `status` (draft/live/suspended), `phone_number_id`, `bsp_provider`, `pricing_tier`, `published_at`
- `tenant_configs` — `tenant_id`, `version`, `compiled_config` (generated state table + per-primitive blocks), `source_draft_session_id`

**Shared by both draft and live runtime (context-scoped, not duplicated per surface):**
- `conversation_state` — keyed by `(context_type: 'draft'|'tenant', context_id, wa_id)`: `current_state`, `last_interaction`, `pending_msg_id`
- `chat_history` — same `(context_type, context_id, wa_id)` scoping, `message_id`, `direction`, `payload`, `status`

**Promotion**: on "go live," compiler runs a final full-validation gate; on pass, create/update `tenants` (with the `phone_number_id` from the completed BSP connect flow) and `tenant_configs`, mark the source draft `promoted`.

**Post-launch edits (dashboard bot editor)**: editing a live bot creates a *new* `draft_configs` row scoped to the existing `tenant_id` (not a fresh anonymous draft), reusing the identical interview-agent + compiler/validator path. The compiler diffs this against the current `tenant_configs.compiled_config` so the dashboard can show "what changed" before the business re-publishes. Re-testing that edit uses the same sandbox join-token mechanism, just issued to a logged-in user instead of an anonymous prospect.

---

## Interview Agent Design (Stage 1)

The LLM never decides what's required — the primitive schemas do:

1. `draft_configs.field_values` is the source of truth (Postgres), not LLM memory.
2. Each turn: LLM does structured extraction via function-calling, with the tool schema generated directly from `primitive_registry` field definitions — output is a field-value patch, never free text logic.
3. Patch merges into `field_values`; the Stage 2 validator runs immediately to recompute missing required fields.
4. Next turn's prompt is built from the missing-fields list + their `interview_hints` — the LLM can't ask about something outside the schema, and can't skip something the schema requires.
5. **LOB classification**: open-ended opening ("tell me about your business"), matched against `lob_recipes.classification_examples`; on ambiguity, ask one clarifying question, then fall back to a safe minimal recipe (`business_info` + `faq_support` + `human_escalation`) so the interview never dead-ends.
6. **Revenue/size** is asked once, after primitive selection is locked, and only maps to `tenants.pricing_tier` — never touches validation.
7. **Termination**: zero missing required fields across selected primitives *and* explicit user confirmation of a summary — never an LLM guess that "we're done."
8. **Resumability**: a returning user's "what's left" is recomputed from the validator against stored `field_values`, not from replaying the conversation — this is what makes both pre-signup resumption and post-launch dashboard editing cheap and correct.

---

## Compiler/Validator Design (Stage 2)

Pure, LLM-free TypeScript, unit-testable against fixture JSON:

- `validateField(schema, value)` → field-level errors
- `validateDraft(draftConfig)` → per-primitive validation + cross-primitive checks (e.g. `booking` needs `business_info.hours`; `catalogue` needs ≥1 item)
- `compile(draftConfig)` → merges validated fields + primitive defaults + renderer hints into `compiled_config`: a generated root-menu spec and state table (`state → {primitive_key, handler_args}`) — the direct generalization of Pittie's hand-authored State Router, but generated from config, never hand-authored per tenant.

Three gates use this: incremental (during interview, drives missing-field prompts), partial-validity (unlocks "test on sandbox" once enough primitives are coherent to preview, even if others aren't done), full (unlocks "go live").

**Known gap, not designed in this pass**: `primitive_registry.schema_version` will change over time (new required field added to `catalogue` post-launch); migrating already-compiled tenants against a schema change needs a strategy later — the versioned schema/config split leaves room for it, but it isn't solved here.

---

## Runtime Engine Design (Stage 3)

Single generic interpreter, WhatsApp adapter for MVP, designed so a future channel adapter is plausible without a redesign:

1. Inbound webhook (via BSP) → normalized `InboundMessage`.
2. **Context resolution**: `phone_number_id` → `tenants` lookup (live path); if it matches the pooled sandbox number, route through `SandboxRouter` instead. Both resolve to `{context_type, context_id, compiled_config}`.
3. Load/create `conversation_state` scoped to that context.
4. 24h expiry check against `last_interaction` → reset to root state if stale (generalization of Pittie's reset logic).
5. Free-text debounce (replacing n8n's Wait node): stamp `pending_msg_id`, durable-execution step sleeps 8s, re-checks it's still the latest before proceeding.
6. Generic interpreter: `compiled_config.state_table[current_state]` → primitive_key → dispatch to a generic per-primitive-type handler (`CatalogueHandler`, `BookingHandler`, `FaqHandler`, `EscalationHandler`, …), parameterized entirely by that tenant's compiled block. No per-tenant bespoke code, ever — this is the direct generalization of Pittie's Brand Logic Engine.
7. Handler returns `{next_state, outbound_payload}`, or delegates to an LLM for `faq_support`/`human_escalation`.
8. Send → log (`chat_history`) → set-state (`conversation_state`) triplet, preserved exactly as Pittie does it.
9. Delivery-status webhooks update `chat_history.status` by `message_id`.
10. When `human_escalation` fires (ticket created) or a delivery fails, write a `dashboard_notifications` row — this is the direct link between the runtime and Surface 2's escalations feed.
11. Scheduled follow-ups (booking reminders, escalation timeouts) via durable-execution steps keyed by `(context, wa_id)`, **must be explicitly canceled on state transition** — an uncanceled stale job firing late/duplicate messages is a real bug class to test for directly.

---

## Customer Dashboard Design (Pillar 2)

This is where a signed-up business lives after their bot is built. Core pages/panels:

- **Home/overview**: bot status (draft/testing/live), quick links into the sections below.
- **Plan & billing**: current tier (mapped from `tenants.pricing_tier`), usage against tier limits, upgrade/downgrade.
- **Bot editor**: the same interview-agent chat interface as pre-signup, but scoped to the existing `tenant_id` — opens a new `draft_configs` row against that tenant, runs through the identical compiler/validator, shows a diff against the currently-live `compiled_config` before re-publish. This is the concrete implementation of "autotune the bot with a prompt" post-launch, not just at onboarding.
- **Test/re-test**: same sandbox join-token + shared-number mechanism as the pre-signup flow, issued to a logged-in session instead of an anonymous one — lets a business validate an edit before it goes live to real customers.
- **Escalations & discrepancies feed**: reads `dashboard_notifications` — support tickets from `human_escalation`, delivery failures, and post-edit compiler validation warnings, each linking to the underlying record (ticket or chat_history entry). This is the ops surface the business actually checks day to day.
- **Conversation history viewer**: read view over `chat_history` scoped to their `tenant_id` — a natural companion to the escalations feed, so a business can see full context around a flagged conversation, not just the flag.
- **Connect your WhatsApp number**: the BSP onboarding action (below) — lives here because it's the dashboard's job to turn a tested draft into a live tenant.

---

## Admin Panel Design (Pillar 3)

Internal-only, separately authenticated from customer accounts (its own `admin_accounts`/role table — not reachable via customer login). Scoped as a real control plane from the start, not a thin monitoring page, since it's where your team operates the platform day to day as the primitive library and tenant base grow:

- **Primitive & LOB registry view**: every primitive in `primitive_registry` (key, schema version, required/optional fields), every `lob_recipes` entry referencing it, and which live tenants have it active. This must be automatic, not a manual step — as engineers add a new primitive schema, it shows up here without separate admin work. Read-first for MVP; editing/versioning primitive schemas from this UI (vs. code) is a reasonable fast-follow, not required on day one.
- **Cross-tenant operations view**: every tenant, status (draft/testing/live/suspended), plan tier, last activity, message volume — the one place to see how many businesses are live and which ones need attention.
- **Platform health / BSP monitoring**: the shared sandbox number's quality rating and volume (directly addresses the sandbox-throttling risk below), plus per-tenant number health once live, with a manual cutover control to swap in a standby sandbox number if the primary degrades.
- **Cross-tenant escalation & discrepancy oversight**: a roll-up across every tenant's `dashboard_notifications`, not just the per-tenant view customers see — needed if your team does any support/QA oversight across the whole customer base.
- **Manual intervention tools**: unstick a stuck draft, override a tenant's compiled config, force-expire a sandbox binding, adjust a plan tier by hand — the escape hatches for when the automated flow needs a human to unblock it.

This pillar introduces no new core data model — it reads from (and gets role-scoped write access to) the same tables everything else uses: `primitive_registry`, `lob_recipes`, `tenants`, `tenant_configs`, `draft_sessions`, `dashboard_notifications`. The only addition is `admin_accounts` for internal auth.

---

## BSP Recommendation

**360dialog**, primarily because it exposes Meta's Cloud API semantics almost 1:1 (including `phone_number_id`-centric routing), which is exactly what the Pittie reference already assumes — keeps the BSP adapter thin, and its partner API supports programmatic multi-number provisioning, needed both for the shared sandbox number now and many tenant numbers later.

**Flag**: 360dialog's self-serve story for a *pooled sandbox/test number* specifically is less proven than Twilio's purpose-built WhatsApp Sandbox. Recommend a week-1 spike verifying 360dialog's sandbox-number terms before committing; Twilio is a credible fallback for the sandbox number specifically if it falls short, without requiring a second full BSP adapter.

**Connect-your-number flow**: dashboard action → BSP-driven WABA/number registration → BSP returns/webhooks a `phone_number_id` → stored on `tenants` → triggers the compile+publish gate → runtime starts accepting webhooks for that number automatically, since context resolution is just a table lookup.

---

## Sandbox Number Multiplexing Mechanism

1. Once a draft passes the partial-validity gate, generate a `draft_wa_bindings.token`, `status=pending`, short expiry (~30 min).
2. Render a `wa.me/<sandbox_number>?text=JOIN <token>` deep link / QR in the UI (works identically for an anonymous prospect on Surface 1 or a logged-in user re-testing on Surface 2).
3. Tester taps → WhatsApp opens pre-filled "JOIN <token>" → sends to the shared sandbox number.
4. Runtime resolves the sandbox `phone_number_id` → `SandboxRouter` → parses the join token, binds `wa_id → draft_session_id` (`status=bound`), creates `conversation_state` scoped `(draft, draft_session_id, wa_id)`, sends the root menu from the draft's compiled config.
5. Subsequent messages from that `wa_id` resolve via the active binding, through the same generic interpreter used for live traffic.
6. **Collision handling**: one `wa_id` holds one active binding at a time; testing a second draft requires an explicit reset or waiting out expiry.
7. **Cleanup**: durable-execution cron sweeps expired bindings/drafts (inactivity window + draft TTL).
8. **Risk**: pooled test traffic on one number is subject to Meta's per-number quality/rate limits — heavy sandbox usage could throttle or quality-downgrade the number for everyone testing at once. Mitigate with quality-rating monitoring and a warm standby number ready to cut over.
9. **Risk**: proactive nudges (e.g. "your test session is expiring") would need an approved WhatsApp template. Skip proactive nudges in MVP — let sandbox sessions silently expire.

---

## Build Sequence / Milestones

- **M0 — Foundations**: `primitive_registry` schemas for `business_info`/`catalogue`/`faq_support`/`human_escalation`; compiler/validator as pure TS + unit tests; full Postgres schema (including `accounts`/`admin_accounts`/`dashboard_notifications`, not just draft/tenant tables); a lightweight internal primitive-registry viewer (read-only page) so new primitives are visible to the team the moment they're added, not bolted on later. *Exit: hand-crafted draft JSON compiles correctly, flags missing fields, and shows up in the internal viewer.*
- **M1 — Interview agent**: function-calling extraction wired to incremental validation, tested against synthetic business personas (transcripts, no UI). *Exit: synthetic scripts with varied phrasing converge to valid configs within a bounded turn count.*
- **M2 — Runtime + sandbox loop**: BSP adapter, generic interpreter + M0 primitive handlers, `conversation_state`/`chat_history`, sandbox token/binding flow, durable execution for debounce/expiry/cleanup. *Exit: a prospect completes the M1 interview, taps the wa.me link, has a real conversation on the shared sandbox number rendering their config correctly.*
- **M3 — Accounts, dashboard shell, connect-your-number, promote**: auth, `account_tenants`, plan/billing display, BSP-driven number connection, draft→tenant promotion. *Exit: a signed-up user can connect a real number and see their bot flip from draft to live.*
- **M4 — Customer dashboard operations surface (Pillar 2)**: bot editor (interview agent scoped to a live tenant + diff/re-publish), re-test via sandbox mechanism, escalations/discrepancies feed wired to `human_escalation` + delivery failures, conversation history viewer. *Exit: a live business can edit their bot, see the diff, re-test, re-publish, and see a real escalation appear in their dashboard.*
- **M5 — Admin panel, deepened (Pillar 3)**: cross-tenant operations view, platform health/BSP quality monitoring with standby cutover, cross-tenant escalation roll-up, manual intervention tools. *Exit: your team can see every tenant's status and health in one place, and unblock a stuck onboarding or config without touching the database directly.*
- **M6 — First real pilot**: run one real SMB through the full funnel (pillars 1 → 2 → 4, with pillar 3 supporting from the side) end to end; fix issues surfaced by real, non-synthetic usage. *Exit: the pilot's real customers get correct answers on the business's real number, unattended, for 1–2 sustained weeks.*

Realistic for 1–2 backend engineers + one person owning interview/prompt design, with M1/M2 overlap once schemas stabilize. Total MVP timeline on the order of 3–4 months given the admin panel (M5) is now scoped as a real control plane, not a thin afterthought — treat M5's depth as the main lever if the timeline needs to compress (see risk below).

---

## Synthetic Data Bootstrap

Direct extension of the synthetic-seed-generation methodology already used on Spree/Frappebooks: generate N synthetic SMB profiles per candidate LOB (varying completeness, phrasing, edge cases like "no fixed hours"). Two uses: (a) a second LLM "plays the business owner" from a synthetic profile to regression-test Stage 1's classification/extraction/termination without a human tester per iteration; (b) valid synthetic compiled configs drive scripted conversation trees against Stage 3 (menu taps, mistypes, escalation triggers) as automated regression tests. Build a **mock BSP adapter** (same interface, in-memory events) so M0–M2 (and dashboard edit/re-test cycles in M4) run in CI without touching real WhatsApp/BSP rate limits — only the final demo/pilot needs the real sandbox number.

---

## Verification / Demo Plan

1. Automated: synthetic interview transcript → assert compiled config valid.
2. Automated: scripted conversation against the mock BSP adapter → assert correct message sequence/state transitions.
3. Live: one synthetic business run through the real browser interview UI → real wa.me tap → real sandbox-number conversation (screen-recorded).
4. Live: connect a real/test WhatsApp Business number via the chosen BSP, repeat the same conversation on it — proves "connect your number → bot goes live."
5. Live: from the dashboard, edit that live bot's config, see the diff, re-test via sandbox, re-publish, and confirm an escalation raised during testing appears in the dashboard's notifications feed — proves Surface 2 end to end, not just Surface 1/3.
6. Package 3–5 as the stakeholder-facing MVP proof artifact.

---

## Durable Execution: Inngest vs. Temporal

**Inngest**, for MVP. Given a TS-first stack with no near-term polyglot need, Inngest's step-function model lives directly in the application codebase and deploys as ordinary Node/serverless handlers, with no cluster to operate — maps cleanly onto the debounce/cleanup/scheduled-reminder needs here. Temporal is more battle-tested for long-running, compensation-heavy sagas at scale, but the operational overhead of running (or paying for) a Temporal server isn't justified yet. Revisit specifically if `booking` reminder chains and dashboard-driven re-publish workflows grow into genuinely long-running, multi-day sagas — a deliberate fast-follow reconsideration point, not an MVP blocker.

---

## Open Decision (not locked by this plan)

**First LOB.** Retail/D2C is recommended for lowest technical risk (every primitive it needs is already proven), but this should be confirmed against whichever business is the actual first pilot candidate before M0 schema work locks in — if that pilot is a services/booking business, `booking` should be pulled into M0 instead, accepting the added complexity earlier.

---

## Repo & Folder Structure (Initial Scaffold)

Single monorepo, TypeScript end-to-end (per the stack decision above), pnpm workspaces:

```
whatsapp-bot-platform/
├── apps/
│   ├── web/              # Pillar 1 — public site: pricing + interview agent chat
│   ├── dashboard/         # Pillar 2 — customer dashboard
│   ├── admin/             # Pillar 3 — internal admin panel
│   ├── interview-api/     # Stage 1 backend — interview turn handler, LLM function-calling extraction
│   └── runtime/           # Stage 3 backend — webhook ingestion, context resolver, generic interpreter,
│                           #   sandbox router (serves BOTH sandbox draft traffic and live tenant traffic)
├── packages/
│   ├── schema/            # primitive_registry JSON Schemas + lob_recipes — source of truth
│   ├── compiler/          # Stage 2 — validate.ts, compile.ts (pure, LLM-free)
│   ├── db/                 # Supabase/Postgres client, generated types, migrations
│   └── shared-types/       # cross-app TS types: DraftConfig, CompiledConfig, InboundMessage, etc.
├── infra/
│   └── inngest/            # durable-execution functions: debounce, session-expiry sweep,
│                           #   sandbox-binding cleanup, scheduled reminders
├── docs/
│   └── architecture.md     # working copy of this plan, kept in-repo as the living reference
├── package.json
├── pnpm-workspace.yaml
└── .gitignore
```

**Why this shape**: `packages/schema` and `packages/compiler` get imported by three different apps — `interview-api` validates/compiles as the interview progresses, `runtime` compiles on publish/re-publish, `admin` reads the registry for its primitive/LOB view. Keeping them as standalone packages instead of duplicating logic per-app is what actually *enforces* the "one generic interpreter, no per-tenant bespoke code" rule at the code level, not just by convention.

**Initial git setup**: `git init`, `.gitignore` (node_modules, .env, build artifacts), scaffold the folder tree above with placeholder `package.json`/README per package stating its role, copy this plan into `docs/architecture.md`, one initial commit. Pushing to a remote is deferred until the destination is confirmed (new GitHub repo — personal or an org, visibility, repo name) — that's a shared-state action worth confirming explicitly rather than assuming.

---

## Consolidated Risks

1. Shared sandbox number quality/rate limits — pooled test traffic can throttle the one number everyone tests through; needs monitoring + standby number.
2. Proactive sandbox nudges require approved WhatsApp templates — skip them in MVP.
3. Primitive schema versioning/migration for already-compiled tenants — not designed in this pass, real gap once schemas evolve post-launch.
4. Stale scheduled durable-execution jobs (reminders/escalation timeouts) must be explicitly canceled on state transition, or they fire duplicate/late messages.
5. 360dialog's pooled-sandbox-number self-serve story is unverified — spike week 1; Twilio is a fallback for the sandbox number specifically.
6. `wa_id` binding collisions in the sandbox — one phone testing multiple drafts needs an explicit reset, not silent overwrite.
7. Dashboard/live-edit re-publish flow (M4) doubles the paths that hit the compiler/sandbox mechanism (pre-signup drafts and post-launch tenant edits) — worth explicit test coverage for both, not just the pre-signup path, since it's easy to build and test only the funnel and undertest the ongoing-management surface.
8. The admin panel (Pillar 3) is now scoped as a real second application, not a page — it's genuine, ongoing engineering investment running in parallel with pillars 1/2/4. Recommend timeboxing M5 to its stated MVP scope (registry visibility, cross-tenant view, health monitoring, basic intervention tools) and treating deeper tooling as demand-driven fast-follows, so it doesn't quietly balloon into its own multi-month build alongside the customer-facing product.
