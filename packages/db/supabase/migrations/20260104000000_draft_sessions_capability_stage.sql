-- interview-session.ts's processTurn() no longer locks selectedPrimitives
-- off a one-shot LOB classification against a 2-recipe lookup table
-- (packages/schema's lob_recipes.ts). It now classifies which primitives
-- apply directly (capability-classifier.ts), then asks one open "anything
-- else?" catch-all question before locking selectedPrimitives in for real —
-- two new turn-flow states that, like lob_ambiguity_asked/confirmed added in
-- 20260103000000, belong on draft_sessions (the interview's flow/progress),
-- not draft_configs (the draft's content).
alter table draft_sessions add column capability_stage text not null default 'detecting';
alter table draft_sessions add column pending_primitives text[];
