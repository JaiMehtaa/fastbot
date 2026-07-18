# apps/runtime — Stage 3: Runtime Engine

The single generic interpreter. Serves BOTH sandbox draft traffic and live tenant traffic through the identical code path — the only place those two ever differ is context resolution.

1. Inbound webhook (via BSP) → normalized `InboundMessage`.
2. Context resolution: `phone_number_id` → `tenants` lookup (live), or the pooled sandbox number → `SandboxRouter` (draft). Both resolve to `{context_type, context_id, compiled_config}`.
3. Load/create `conversation_state` scoped to that context; 24h expiry check resets to root state if stale.
4. Free-text debounce via durable execution (`infra/inngest`): stamp `pending_msg_id`, sleep 8s, re-check still-latest before responding.
5. Generic interpreter: `compiled_config.state_table[current_state]` → primitive_key → dispatch to a generic per-primitive-type handler, parameterized entirely by that tenant's compiled block. **No per-tenant bespoke code, ever** — this is the direct generalization of the hardcoded per-brand logic in the original Pittie reference workflow.
6. Send → log (`chat_history`) → set-state (`conversation_state`) triplet.
7. `human_escalation` firing or a delivery failure writes a `dashboard_notifications` row, feeding `apps/dashboard`'s and `apps/admin`'s escalation feeds.

`SandboxRouter` (the token-join/binding logic for the shared sandbox WhatsApp number) lives here as `sandbox-router.ts`.

See `/docs/architecture.md` for full system design.
