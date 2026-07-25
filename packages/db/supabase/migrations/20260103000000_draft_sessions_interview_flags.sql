-- apps/interview-api's InterviewSessionState (interview-session.ts) carries
-- two turn-flow flags that have no home in the original schema:
-- lobAmbiguityAsked (has the LOB clarifying question already been asked
-- once this session?) and confirmed (has the user confirmed the final
-- summary?). These belong on draft_sessions, not draft_configs — they're
-- properties of the interview's flow/progress, not of the draft's content
-- (which draft_configs.field_values/selected_primitives/lob_key mirrors
-- exactly, matching DraftConfig's own shape).
alter table draft_sessions add column lob_ambiguity_asked boolean not null default false;
alter table draft_sessions add column confirmed boolean not null default false;
