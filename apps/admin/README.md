# apps/admin — Pillar 3: Admin Panel (Internal)

Internal-only control plane, separately authenticated from customer accounts (`admin_accounts`, not the customer `accounts` table). Not a thin monitoring page — this is where the team operates the platform as the primitive library and tenant base grow:

- Primitive & LOB registry view — reads `packages/schema`'s `primitive_registry` / `lob_recipes` directly; must reflect new primitives automatically as they're added, no manual step
- Cross-tenant operations view — every tenant, status, plan tier, activity
- Platform health / BSP monitoring — shared sandbox number quality rating + volume, standby cutover control
- Cross-tenant escalation & discrepancy oversight — roll-up across all tenants' `dashboard_notifications`
- Manual intervention tools — unstick a stuck draft, override a compiled config, force-expire a sandbox binding, adjust a plan tier

Introduces no new core data model beyond `admin_accounts`; reads/writes the same tables as the rest of the system.

See `/docs/architecture.md` for full system design.
