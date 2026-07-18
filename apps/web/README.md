# apps/web — Pillar 1: Public Web Page

Unauthenticated marketing + product page: pricing/value prop plus the interview-agent chat in one place. A prospect builds and sandbox-tests a bot here with zero signup friction.

Talks to `apps/interview-api` (Stage 1) to run the interview and to `packages/compiler` (via interview-api) for live validation feedback. Surfaces the "Test on WhatsApp" sandbox join link once a draft passes the partial-validity gate.

See `/docs/architecture.md` for full system design.
