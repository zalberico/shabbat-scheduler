-- Shabbat Scheduler Schema

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  phone text not null,
  default_dietary_restrictions text[] default '{}',
  default_kashrut_preference text default 'none' check (default_kashrut_preference in ('none', 'kosher_style', 'strict_kosher', 'glatt_kosher')),
  default_shabbat_observance text default 'flexible' check (default_shabbat_observance in ('flexible', 'traditional', 'shomer_shabbat')),
  is_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Phone allowlist for community verification
create table public.phone_allowlist (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  uploaded_at timestamptz default now()
);

-- Weekly host offerings
create table public.weekly_hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_of date not null,
  seats_available int not null check (seats_available > 0),
  kashrut_level text not null check (kashrut_level in ('none', 'kosher_style', 'strict_kosher', 'glatt_kosher')),
  start_time text not null,
  walking_distance_only boolean default false,
  notes text,
  status text default 'open' check (status in ('open', 'matched', 'cancelled')),
  created_at timestamptz default now(),
  unique(user_id, week_of)
);

-- Weekly guest signups
create table public.weekly_guests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_of date not null,
  party_size int not null default 1 check (party_size > 0),
  dietary_restrictions text[] default '{}',
  kashrut_requirement text default 'none' check (kashrut_requirement in ('none', 'kosher_style', 'strict_kosher', 'glatt_kosher')),
  can_walk boolean default false,
  notes text,
  status text default 'pending' check (status in ('pending', 'matched', 'unmatched')),
  created_at timestamptz default now(),
  unique(user_id, week_of)
);

-- Matches (one per host per week)
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  week_of date not null,
  host_id uuid not null references public.weekly_hosts(id) on delete cascade,
  created_at timestamptz default now(),
  unique(host_id)
);

-- Match guests (many guests per match)
create table public.match_guests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  guest_id uuid not null references public.weekly_guests(id) on delete cascade,
  unique(guest_id)
);

-- Indexes
create index idx_weekly_hosts_week on public.weekly_hosts(week_of);
create index idx_weekly_guests_week on public.weekly_guests(week_of);
create index idx_matches_week on public.matches(week_of);
create index idx_users_phone on public.users(phone);

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- Row Level Security

alter table public.users enable row level security;
alter table public.phone_allowlist enable row level security;
alter table public.weekly_hosts enable row level security;
alter table public.weekly_guests enable row level security;
alter table public.matches enable row level security;
alter table public.match_guests enable row level security;

-- Users: can read own profile, admins can read all
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Admins can read all users" on public.users
  for select using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

-- Phone allowlist: admins only
create policy "Admins can manage allowlist" on public.phone_allowlist
  for all using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

-- Service role can check allowlist during signup
create policy "Service role can read allowlist" on public.phone_allowlist
  for select using (true);

-- Weekly hosts: users can manage own, everyone can read for matching
create policy "Users can manage own host entries" on public.weekly_hosts
  for all using (auth.uid() = user_id);

create policy "Authenticated users can read hosts" on public.weekly_hosts
  for select using (auth.uid() is not null);

-- Weekly guests: users can manage own, admins can read all
create policy "Users can manage own guest entries" on public.weekly_guests
  for all using (auth.uid() = user_id);

create policy "Admins can read all guests" on public.weekly_guests
  for select using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

-- Matches: participants and admins can read
create policy "Participants can read their matches" on public.matches
  for select using (
    auth.uid() in (
      select wh.user_id from public.weekly_hosts wh where wh.id = host_id
    )
    or auth.uid() in (
      select wg.user_id from public.weekly_guests wg
      join public.match_guests mg on mg.guest_id = wg.id
      where mg.match_id = id
    )
    or exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

create policy "Admins can manage matches" on public.matches
  for all using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

-- Match guests: same as matches
create policy "Participants can read match_guests" on public.match_guests
  for select using (
    exists (
      select 1 from public.matches m where m.id = match_id and (
        auth.uid() in (select wh.user_id from public.weekly_hosts wh where wh.id = m.host_id)
        or auth.uid() in (
          select wg.user_id from public.weekly_guests wg
          join public.match_guests mg2 on mg2.guest_id = wg.id
          where mg2.match_id = m.id
        )
        or exists (select 1 from public.users where id = auth.uid() and is_admin = true)
      )
    )
  );

create policy "Admins can manage match_guests" on public.match_guests
  for all using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );
