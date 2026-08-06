-- The revamped interview now opens by asking who it's talking to (name +
-- contact) before asking anything about the business itself. draft_sessions
-- already had an unused owner_contact column anticipating this; this adds
-- the matching owner_name. Both stay null for the (large) portion of the
-- interview lifecycle before this stage runs, and permanently null if the
-- owner never answers — see apps/interview-api/src/interview-session.ts's
-- owner_info stage: this is never allowed to block the rest of the
-- interview, so there's no NOT NULL constraint here.
alter table draft_sessions add column owner_name text;
