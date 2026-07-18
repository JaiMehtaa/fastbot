# apps/dashboard — Pillar 2: Customer Dashboard

Authenticated surface where a signed-up business lives day to day:

- Plan & billing (reads `tenants.pricing_tier`)
- Bot editor — same interview-agent chat as `apps/web`, but scoped to an existing `tenant_id`; opens a new `draft_configs` row, diffs against the live `compiled_config` before re-publish ("autotune via prompt" post-launch)
- Test/re-test via the same sandbox join-token mechanism as pre-signup, issued to a logged-in session
- Escalations & discrepancies feed — reads `dashboard_notifications`
- Conversation history viewer — reads `chat_history` scoped to the tenant
- Connect-your-WhatsApp-number action (BSP onboarding), which promotes a draft to a live `tenant`

See `/docs/architecture.md` for full system design.
