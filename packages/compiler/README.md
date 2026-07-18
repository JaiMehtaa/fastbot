# packages/compiler — Stage 2: Compiler / Validator

Pure, LLM-free TypeScript. No network calls, no LLM — this is what makes it independently unit-testable against fixture JSON.

- `validateField(schema, value)` → field-level errors
- `validateDraft(draftConfig)` → per-primitive validation + cross-primitive checks (e.g. `booking` requires `business_info.hours`; `catalogue` requires ≥1 item)
- `compile(draftConfig)` → merges validated fields + primitive defaults + renderer hints into `compiled_config`: a generated root-menu spec and state table (`state → {primitive_key, handler_args}`) — generated from config, never hand-authored per tenant.

Used at three gates: incremental (during interview, in `apps/interview-api`), partial-validity (unlocks sandbox testing), full (unlocks "go live" / promotion to a `tenant`).

Known open gap: `primitive_registry.schema_version` migrations for already-compiled tenants are not yet designed.
