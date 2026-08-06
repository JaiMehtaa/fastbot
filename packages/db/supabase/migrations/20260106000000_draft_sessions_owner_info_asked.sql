-- Mirrors lob_ambiguity_asked's role (20260103000000) but for the owner_info
-- stage: tracks whether the one-time name/contact follow-up question has
-- already been asked this session, so a resumed session doesn't ask it
-- twice. Without this, InterviewSessionState.ownerInfoAsked would have no
-- home and would silently reset to false on every resume.
alter table draft_sessions add column owner_info_asked boolean not null default false;
