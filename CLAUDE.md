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
- **Email sending is lazy**: `new Resend()` is called inside functions, not at module level, to avoid build-time errors when the API key isn't available.
- **RLS policies use table aliases**: All RLS policies reference `public.users u where u.id = auth.uid()` to avoid ambiguous column references.

## Important File Locations

- **Database schema**: `supabase/migrations/001_initial_schema.sql`
- **Types + constants**: `src/lib/types/database.ts` (kashrut levels, dietary options, start times)
- **Auth helpers**: `src/lib/auth.ts` (`requireAuth`, `requireAdmin`)
- **Matching algorithm**: `src/app/api/match/route.ts`
- **Email templates**: `src/lib/email/templates.tsx`
- **Supabase clients**: `src/lib/supabase/` (client.ts, server.ts, admin.ts, middleware.ts)
- **Week picker**: `src/components/week-picker.tsx` (reusable, used by host + admin pages)
- **Cron config**: `vercel.json`

## Common Patterns

- Route groups: `(auth)` for login/signup, `(app)` for authenticated pages
- Admin pages call `requireAdmin()` which returns `{ user, supabase, adminClient }`
- Forms use client components with `'use client'` and `useState`/`useEffect`
- `getWeekOf()` returns the next Friday as `YYYY-MM-DD`
- `isBeforeDeadline(weekOf?)` accepts optional week string for per-week deadline checks
- `getFutureFridays(count)` returns next N Fridays; `isValidFutureFriday(weekOf)` validates a date is a real future Friday
- **Multi-week hosting**: Hosts can list dinners up to 6 weeks ahead. Browse page shows all upcoming dinners in a flat list (no week filter). Host/admin pages use `WeekPicker` component with `?week=` URL param. API routes accept `week_of` from body/query, default to `getWeekOf()`.
- **Cron jobs are this-week only**: `/api/cron/match` and `/api/cron/remind` always use `getWeekOf()`. Future-week matching must be triggered manually by admin via `/admin/match`.
- `@ts-expect-error` or `as any` casts on Supabase joined query results (e.g., `host.users.name`) due to type inference limitations
- Match notifications use a single group email per match (`to: [hostEmail, ...guestEmails]`) via Resend, so everyone can reply-all. Template is `MatchGroupEmail`.

## Deployment

- Vercel auto-deploys from GitHub `main` branch
- Env vars set in Vercel dashboard (including `RESEND_API_KEY`, `CRON_SECRET`, etc.)
- Email sending domain: `shabbat.zalberico.com` (via Resend)
- Supabase auth redirects configured for both localhost and production URL

## Build & Dev

```bash
npm run dev      # Start dev server on :3000
npm run build    # Production build (also runs type checking)
npm run lint     # ESLint
```
