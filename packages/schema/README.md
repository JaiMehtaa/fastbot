# packages/schema — Primitive & LOB Registry (Source of Truth)

`primitive_registry`: one JSON Schema doc per primitive (`business_info`, `catalogue`, `offers`, `faq_support`, `human_escalation`, `lead_capture`, `booking`, `order_management`), each with:

- `required_fields` / `optional_fields` (name, type, validation rule, example)
- `interview_hints` per field — question phrasing templates, consumed only by `apps/interview-api`, never by the compiler
- `renderer_contract` — exact shape `apps/runtime` needs to build interactive payloads
- `state_contract` — conversation states this primitive introduces

`lob_recipes`: named sets of primitives (e.g. `retail_d2c`, `salon_services`) + classification examples used to match a business's free-text description to a recipe.

Imported by `packages/compiler` (validation/compilation), `apps/interview-api` (question generation), and `apps/admin` (registry visibility — every primitive added here must show up in the admin panel automatically).

First LOB to build out fully is still open — see "Open Decision" in `/docs/architecture.md`.
