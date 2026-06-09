# Shabbat Scheduler

A web app for the Noe Valley Chavurah to coordinate weekly Shabbat dinners. Members sign up as hosts or guests each week, an automated matching algorithm pairs them up, and email notifications go out with dinner details.

**Live**: https://shabbat-scheduler.vercel.app

## How It Works

1. **Sunday-Wednesday**: Hosts offer seats (with kashrut level, start time, preferences). Guests sign up (party size, dietary needs, requirements). Hosts can list dinners up to 6 weeks in advance; guests can browse and directly sign up for any upcoming dinner.
2. **Wednesday 11:59 PM PT**: Signup deadline (per-week — each Friday has its own Wednesday cutoff)
3. **Thursday morning (16:00 UTC — 8 AM PST / 9 AM PDT)**: Automated matching runs for this Friday — a group email goes out to each match (host + guests together) with dinner details. Admins can also manually trigger matching for future weeks and assign/remove guests from dinners; re-running matching is safe (already-placed guests keep their seats, previously unmatched guests are re-considered, and notification emails send at most once).
4. **Friday**: Shabbat shalom!

## Tech Stack

- **Framework**: Next.js 14 (App Router) with TypeScript
- **Database + Auth**: Supabase (PostgreSQL, magic link email auth, Row Level Security)
- **Email**: Resend + React Email templates
- **Hosting**: Vercel (with Cron Jobs for automated matching/reminders)
- **Styling**: Tailwind CSS

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, signup pages
│   ├── (app)/            # Authenticated pages
│   │   ├── dashboard/    # Weekly status + upcoming dinners with full details
│   │   ├── host/         # Host signup form (supports future weeks)
│   │   ├── browse/       # Browse & direct signup for dinners (all upcoming weeks)
│   │   ├── join/         # Guest signup form (match pool, this week only)
│   │   ├── profile/      # User preferences
│   │   ├── history/      # Past dinners with full detail cards
│   │   └── admin/        # Multi-week dashboard, manual matching, members, allowlist
│   ├── api/
│   │   ├── match/        # Matching algorithm
│   │   ├── send-notifications/  # Match result emails
│   │   ├── send-reminders/      # Weekly reminder emails
│   │   ├── cron/         # Vercel cron endpoints
│   │   ├── admin/        # Admin API (members, allowlist, manual guest placement)
│   │   ├── host-guests/         # Host guest list lookup
│   │   ├── cancel-hosting/      # Host cancellation (with guest notifications)
│   │   ├── direct-signup/       # Guest direct signup for a specific dinner
│   │   ├── check-allowlist/     # Phone allowlist lookup
│   │   ├── verify-phone/       # SMS verification (send/check)
│   │   └── geocode/            # Address geocoding
│   ├── privacy/          # Privacy policy
│   ├── terms/            # Terms & conditions
│   └── auth/             # Supabase auth callbacks
├── components/
│   ├── nav.tsx           # Responsive navigation
│   └── week-picker.tsx   # Reusable week selector (host, admin pages)
├── lib/
│   ├── supabase/         # Client, server, admin, middleware
│   ├── email/            # React Email templates + send helper (throws on Resend errors)
│   ├── types/            # Database types + constants
│   ├── auth.ts           # requireAuth/requireAdmin helpers
│   └── utils.ts          # Date helpers, formatting, multi-week utilities
└── middleware.ts          # Auth session management
```

## Matching Algorithm

The matching runs as a greedy algorithm with hard constraints and soft scoring:

**Hard constraints** (must satisfy):
- Guest kashrut requirement <= host kashrut level
- Guest observance requirement <= host observance level
- Guest needing kid-friendly must match kid-friendly host
- Guest needing dog-friendly must match dog-friendly host
- Walking distance guests must be within 1 mile of host
- Total party sizes at a table <= host's available seats

**Soft scoring** (best-effort):
- **Novelty**: Prefer pairings that haven't happened in the last 8 weeks
- **Table fill**: Prefer filling tables fully over leaving empty seats
- **Dietary grouping**: Group guests with similar dietary needs
- **Walking proximity**: Bonus for guests close to host

Hosts are sorted most-constrained-first (strictest kashrut, highest observance, fewest seats), then guests are greedily assigned by score.

Match notifications are sent as a single group email per match (`to:` host, `cc:` all guests) so everyone can reply-all to coordinate. Notifications are idempotent — each match group and unmatched guest is emailed at most once per week (`notified_at` tracking).

**Additional notifications**:
- **Cancellation**: When a host cancels, matched guests are emailed automatically (and returned to the match pool)
- **Dinner full**: When a dinner reaches capacity via direct signups, the host is notified
- **No match**: Guests the algorithm couldn't place get a try-again-next-week email

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Fill in your Supabase and Resend credentials

# Run database migrations (supabase/migrations/, applied in order)
npx supabase db reset --linked
# In production, new migrations are run manually in the Supabase SQL editor
# BEFORE merging code that depends on them

# Start dev server
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `CRON_SECRET` | Secret for authenticating cron job requests |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for SMS verification |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service SID |
| `SKIP_SMS_VERIFICATION` | Set to `true` to bypass SMS verification (e.g., while awaiting 10DLC approval) |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g., `http://localhost:3000`) |

## Cron Jobs

Configured in `vercel.json`:

| Schedule | Endpoint | Description |
|---|---|---|
| Thursday 16:00 UTC (8 AM PST / 9 AM PDT) | `/api/cron/match` | Runs matching algorithm + sends notification emails |
| Monday 17:00 UTC (9 AM PST / 10 AM PDT) | `/api/cron/remind` | Sends reminder emails to members who haven't signed up (excluding banned users) |

All week/deadline logic is anchored to Pacific Time regardless of server timezone.

## Access Control

- **Signup**: Requires phone number on the community allowlist (managed by admins), verified via Twilio SMS. Verification is enforced server-side: a successful code check is recorded in a service-role-only ledger (bound to the signup email) that the auth callback requires before creating the profile, setting `phone_verified` on the user. Can be bypassed with `SKIP_SMS_VERIFICATION=true` (bypass-created accounts are marked `phone_verified = false`).
- **Auth**: Supabase magic link emails (passwordless). Profile creation is server-only — clients cannot insert `users` rows, and client updates are restricted to editable profile fields (not phone/admin/ban/verification flags).
- **RLS**: Row Level Security on all tables — users see only their own data, admins see everything. Restrictive policies also enforce business rules on client-side writes: no hosting and guesting in the same week, party sizes must fit host capacity, and hosts can't reduce seats below booked.
- **Admin**: `is_admin` flag on user profile, checked server-side via `requireAdmin()`
