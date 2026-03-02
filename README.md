# Shabbat Scheduler

A web app for the Noe Valley Chavurah to coordinate weekly Shabbat dinners. Members sign up as hosts or guests each week, an automated matching algorithm pairs them up, and email notifications go out with dinner details.

**Live**: https://shabbat-scheduler.vercel.app

## How It Works

1. **Sunday-Wednesday**: Hosts offer seats (with kashrut level, start time, preferences). Guests sign up (party size, dietary needs, requirements).
2. **Wednesday 11:59 PM PT**: Signup deadline
3. **Thursday 8 AM PT**: Automated matching runs — emails go out to hosts (guest list + dietary info) and guests (host name + dinner details)
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
│   │   ├── dashboard/    # Weekly status overview
│   │   ├── host/         # Host signup form
│   │   ├── join/         # Guest signup form
│   │   ├── profile/      # User preferences
│   │   ├── history/      # Past dinners
│   │   └── admin/        # Admin dashboard, matching, members, allowlist
│   ├── api/
│   │   ├── match/        # Matching algorithm
│   │   ├── send-notifications/  # Match result emails
│   │   ├── send-reminders/      # Weekly reminder emails
│   │   ├── cron/         # Vercel cron endpoints
│   │   ├── admin/        # Admin API routes
│   │   └── check-allowlist/     # Phone verification
│   └── auth/             # Supabase auth callbacks
├── components/
│   └── nav.tsx           # Responsive navigation
├── lib/
│   ├── supabase/         # Client, server, admin, middleware
│   ├── email/            # React Email templates
│   ├── types/            # Database types + constants
│   ├── auth.ts           # requireAuth/requireAdmin helpers
│   └── utils.ts          # Date helpers, formatting
└── middleware.ts          # Auth session management
```

## Matching Algorithm

The matching runs as a greedy algorithm with hard constraints and soft scoring:

**Hard constraints** (must satisfy):
- Guest kashrut requirement <= host kashrut level
- If host requires walking distance, guest must be able to walk
- Total party sizes at a table <= host's available seats

**Soft scoring** (best-effort):
- **Novelty**: Prefer pairings that haven't happened in the last 8 weeks
- **Table fill**: Prefer filling tables fully over leaving empty seats
- **Dietary grouping**: Group guests with similar dietary needs

Hosts are sorted most-constrained-first (strictest kashrut, walking-only, fewest seats), then guests are greedily assigned by score.

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Fill in your Supabase and Resend credentials

# Run database migrations
npx supabase db reset --linked

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
| `NEXT_PUBLIC_APP_URL` | App URL (e.g., `http://localhost:3000`) |

## Cron Jobs

Configured in `vercel.json`:

| Schedule | Endpoint | Description |
|---|---|---|
| Thursday 8 AM PT | `/api/cron/match` | Runs matching algorithm + sends notification emails |
| Monday 9 AM PT | `/api/cron/remind` | Sends reminder emails to members who haven't signed up |

## Access Control

- **Signup**: Requires phone number on the community allowlist (managed by admins)
- **Auth**: Supabase magic link emails (passwordless)
- **RLS**: Row Level Security on all tables — users see only their own data, admins see everything
- **Admin**: `is_admin` flag on user profile, checked server-side via `requireAdmin()`
