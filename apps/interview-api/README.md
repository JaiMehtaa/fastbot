# apps/interview-api — Stage 1: Interview Agent Backend

Runs the conversational interview that turns free text into a structured `draft_configs` row. The LLM never decides what's required — `packages/schema`'s primitive definitions do:

1. Each turn: LLM does structured extraction via function-calling, tool schema generated from `primitive_registry` field definitions — output is a field-value patch, never free text logic.
2. Patch merges into `draft_configs.field_values`; `packages/compiler`'s validator runs immediately to recompute missing required fields.
3. Next turn's prompt is built from the missing-fields list + `interview_hints` from the schema.
4. LOB classification matches free text against `lob_recipes.classification_examples`; falls back to a minimal safe recipe on ambiguity so the interview never dead-ends.
5. Terminates only when validation is clean *and* the user confirms a summary.

Used by both `apps/web` (anonymous, pre-signup) and `apps/dashboard` (scoped to an existing `tenant_id`, post-launch edits) — same handler, different context.

See `/docs/architecture.md` for full system design.
