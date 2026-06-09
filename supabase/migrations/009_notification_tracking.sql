-- Track which matches and unmatched guests have already been emailed so
-- re-running /api/send-notifications (cron retry, admin button) does not
-- send duplicate emails.
alter table public.matches add column if not exists notified_at timestamptz;
alter table public.weekly_guests add column if not exists notified_at timestamptz;
