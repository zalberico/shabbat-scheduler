# Shabbat Scheduler - Claude Code Context

## Quick Reference

- **Stack**: Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase, Resend, Vercel
- **Live**: https://shabbat-scheduler.vercel.app
- **Repo**: https://github.com/zalberico/shabbat-scheduler

## Key Architecture Decisions

- **Supabase client versions pinned**: `@supabase/supabase-js@2.45.0` and `@supabase/ssr@0.5.0`. Newer versions (2.78+) cause `never` type inference issues with joined queries and RLS. Do not upgrade without testing.
- **Cookie API**: v0.5.0 uses `get(name)/set(name,value,options)/remove(name,options)` — NOT `getAll()/setAll()`.
- **Admin queries bypass RLS**: Use `createAdminClient()` (service role) for any admin data access. Never rely on RLS policies for admin reads — they cause type issues and cookie/middleware problems.
- **No admin check in middleware**: Middleware only handles auth redirects. Admin access is enforced page-level via `requireAdmin()` in `src/lib/auth.ts`. This avoids RLS/cookie issues in Safari.
- **API routes are public in middleware**: `/api/*` paths bypass auth middleware. API routes handle their own auth (cron secret or admin check).
- **All emails go through `sendEmail()`** in `src/lib/email/send.ts`: resend v6 returns `{data, error}` WITHOUT throwing on API errors, so the helper throws on `error` to make call-site try/catch and sent-counters work. Never call `resend.emails.send()` directly.
- **`@react-email/render` must stay a direct dependency**: resend dynamically imports it for `react:` payloads. Without a top-level copy, webpack silently bundles an empty stub and every templated email fails at runtime (this broke all email from launch until June 2026).
- **All date logic is PT-anchored**: `getNextFriday()`/`isBeforeDeadline()` in `src/lib/utils.ts` compute against `America/Los_Angeles` via `Intl`, never server-local time (Vercel runs UTC). Don't add date logic that uses `new Date()` weekday/hour directly.
- **Phone verification is enforced server-side** (migration 010): `/api/verify-phone/check` writes a `phone_verifications` ledger row (service-role-only table, bound to signup email); `auth/callback`/`auth/confirm` require a fresh (≤24h) row before creating the profile via the admin client, and set `users.phone_verified`. Client INSERT on `users` is revoked; client UPDATE is column-restricted to name + dietary/kashrut/observance defaults — adding a client-editable profile column requires a grant migration.
- **Same-week + capacity rules enforced via restrictive RLS** (migration 011) for client-side writes (join/host pages write directly from the browser): no host+guest in the same week, party_size must fit capacity, seats can't drop below booked. API routes use the service role (bypasses RLS) so they carry their own in-code checks — keep both in sync.
- **Seat accounting is match_guests-based everywhere**: the matcher, direct-signup, and admin assignment all sum party sizes over `match_guests` (covers direct, algorithm, and admin placements). Never count by `signup_type` alone.
- **RLS policies use table aliases**: All RLS policies reference `public.users u where u.id = auth.uid()` to avoid ambiguous column references.

## Important File Locations

- **Database schema**: `supabase/migrations/` (001–011, applied in order; production migrations are run manually in the Supabase SQL editor before merging code that depends on them)
- **Email send helper**: `src/lib/email/send.ts` (`sendEmail` — throws on resend `{error}`)
- **Types + constants**: `src/lib/types/database.ts` (kashrut levels, dietary options, start times)
- **Auth helpers**: `src/lib/auth.ts` (`requireAuth`, `requireAdmin`)
- **Matching algorithm**: `src/app/api/match/route.ts`
- **Admin match management**: `src/app/api/admin/matches/route.ts` (manual guest placement: assign/remove)
- **Email templates**: `src/lib/email/templates.tsx` (match group, cancellation, dinner-full notifications)
- **Supabase clients**: `src/lib/supabase/` (client.ts, server.ts, admin.ts, middleware.ts)
- **Week picker**: `src/components/week-picker.tsx` (reusable, used by host + admin pages)
- **Cron config**: `vercel.json`
- **Landing page**: `src/app/page.tsx`

## Common Patterns

- Route groups: `(auth)` for login/signup, `(app)` for authenticated pages
- Admin pages call `requireAdmin()` which returns `{ user, supabase, adminClient }`
- Forms use client components with `'use client'` and `useState`/`useEffect`
- `getWeekOf()` returns the next Friday (in Pacific Time) as `YYYY-MM-DD`; Friday counts as the current week all day Friday PT
- `isBeforeDeadline(weekOf?)` accepts optional week string for per-week deadline checks
- `getFutureFridays(count)` returns next N Fridays; `isValidFutureFriday(weekOf)` validates a date is a real future Friday
- **Multi-week hosting**: Hosts can list dinners up to 6 weeks ahead. Browse page shows all upcoming dinners in a flat list (no week filter). Host/admin pages use `WeekPicker` component with `?week=` URL param. API routes accept `week_of` from body/query, default to `getWeekOf()`.
- **Cron jobs are this-week only**: `/api/cron/match` and `/api/cron/remind` always use `getWeekOf()`. Future-week matching must be triggered manually by admin via `/admin/match`.
- `@ts-expect-error` or `as any` casts on Supabase joined query results (e.g., `host.users.name`) due to type inference limitations
- **Set iteration**: TypeScript target doesn't support `[...new Set()]` — use `Array.from(new Set())` instead
- Match notifications use a single group email per match (`to:` host, `cc:` guests) via Resend, so everyone can reply-all. Template is `MatchGroupEmail`.
- **Notification idempotency**: `send-notifications` marks `notified_at` on `matches` and `weekly_guests` (migration 009) — each match-group/unmatched email sends at most once per week; re-running the cron or admin button is safe.
- **Matcher re-runs are safe**: the matcher re-considers `status='unmatched'` guests, excludes banned users and guests already in `match_guests`, and only updates statuses after placement rows insert successfully. `match_guests` is the authoritative placement record.
- **Batched match resolution**: Dashboard and history pages resolve match details (guest lists for hosts, host info for guests) using batched queries with `Promise.all` and lookup maps, not N+1 queries per entry. See `UpcomingDinners` in `dashboard/page.tsx` for the pattern.
- **Admin multi-week view**: Admin dashboard shows all weeks in a flat list with per-week stats (seats open, guests unmatched). Admin can manually assign/remove guests from dinners via `/admin/match`.
- **Email notifications**: Cancellation emails sent when host cancels (to matched guests). Dinner-full emails sent when a dinner reaches capacity.

## Deployment

- Vercel auto-deploys from GitHub `main` branch
- Env vars set in Vercel dashboard (including `RESEND_API_KEY`, `CRON_SECRET`, etc.)
- Email sending domain: `shabbat.zalberico.com` (via Resend; the API key is send-only restricted)
- Supabase auth redirects configured for both localhost and production URL
- **Migrations are manual**: run new `supabase/migrations/*.sql` files in the Supabase SQL editor BEFORE merging code that depends on them
- **SMS**: Twilio Verify delivers OTPs via Twilio's shared short code (22395) — no A2P 10DLC campaign is required for the verification use case. `SKIP_SMS_VERIFICATION=true` bypasses verification (accounts created during bypass get `phone_verified=false`); it is OFF in production.

## Build & Dev

```bash
npm run dev      # Start dev server on :3000
npm run build    # Production build (also runs type checking)
npm run lint     # ESLint
```
