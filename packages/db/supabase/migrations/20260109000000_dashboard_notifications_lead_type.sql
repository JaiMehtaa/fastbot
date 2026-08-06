-- lead_capture (apps/runtime/src/handlers/lead-capture.ts) notifies the
-- dashboard the same way human_escalation does (dashboard_notifications),
-- just with its own type so merchants can tell a lead apart from an
-- escalation in their notification feed.
alter table dashboard_notifications drop constraint dashboard_notifications_type_check;
alter table dashboard_notifications
  add constraint dashboard_notifications_type_check
  check (type in ('escalation', 'lead', 'delivery_failure', 'config_validation_warning'));
