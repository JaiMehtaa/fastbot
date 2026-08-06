# apps/admin — Pillar 3: Admin Panel (Internal)

Internal-only control plane, separately authenticated from customer accounts (`admin_accounts`, not the customer `accounts` table). Not a thin monitoring page — this is where the team operates the platform as the primitive library and tenant base grow:

- Primitive & LOB registry view — reads `packages/schema`'s `primitive_registry` / `lob_recipes` directly; must reflect new primitives automatically as they're added, no manual step
- Cross-tenant operations view — every tenant, status, plan tier, activity
- Platform health / BSP monitoring — shared sandbox number quality rating + volume, standby cutover control
- Cross-tenant escalation & discrepancy oversight — roll-up across all tenants' `dashboard_notifications`
- Manual intervention tools — unstick a stuck draft, override a compiled config, force-expire a sandbox binding, adjust a plan tier

Introduces no new core data model beyond `admin_accounts`; reads/writes the same tables as the rest of the system.

**Status**: prompt management is real and built — everything else on the list above is still a skeleton.

- Auth: simple shared `ADMIN_PASSWORD` env var (see `lib/session.ts`), not the `admin_accounts` model described above — deliberately the fast/minimal option for solo-operator use today; `middleware.ts` gates every route except `/login`.
- `/` — lists every entry in `packages/prompt-config`'s `PROMPT_REGISTRY` (the single source of truth for which LLM-call-site prompts exist, shared with `apps/interview-api` and `apps/runtime`) with its live effective value (override or default), lets you edit and save an override, or reset back to default. Edits take effect within the resolver's ~30s cache TTL, no redeploy. The FAQ fallback's mandatory grounding constraint ("only use what's in the tenant's FAQ list") is hardcoded in `apps/runtime`, not exposed here — this only edits optional tone guidance layered before it.

See `/docs/architecture.md` for full system design.
