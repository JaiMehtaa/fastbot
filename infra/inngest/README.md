# infra/inngest — Durable Execution

Inngest step functions, registered by `apps/runtime` (and later `apps/dashboard` for edit/re-publish flows):

- Free-text debounce: sleep 8s, re-check `pending_msg_id` still matches before responding
- 24h session-expiry sweep
- Sandbox binding/draft cleanup (inactivity window + draft TTL)
- Scheduled follow-ups (booking reminders, escalation timeouts) — **must be explicitly canceled on state transition**, or they fire duplicate/late messages

Chosen over Temporal for MVP: TS-native step-function model, no server to operate. Revisit if `booking` reminder chains and dashboard re-publish workflows grow into long-running, compensation-heavy sagas — see "Durable Execution" in `/docs/architecture.md`.
