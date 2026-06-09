-- Opt-out flag for weekly reminder emails (one-click unsubscribe link in the
-- reminder footer). Transactional emails about a user's own dinners are
-- unaffected. Updated only via the service role (/api/unsubscribe), so no
-- client column grant is needed.
alter table public.users add column email_reminders boolean not null default true;
