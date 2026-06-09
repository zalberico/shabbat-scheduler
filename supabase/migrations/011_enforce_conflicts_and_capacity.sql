-- Server-side enforcement of same-week host/guest exclusion and seat capacity.
-- Restrictive policies apply to authenticated (client-side) writes only; the
-- service role bypasses RLS, so API routes keep their own in-code checks.

-- 1. Can't sign up as a guest for a week you're actively hosting.
CREATE POLICY "No guest signup when hosting same week" ON public.weekly_guests
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.weekly_hosts wh
      WHERE wh.user_id = weekly_guests.user_id
        AND wh.week_of = weekly_guests.week_of
        AND wh.status <> 'cancelled'
    )
  );

-- 2. Can't create a host entry for a week you have a guest signup.
CREATE POLICY "No hosting when guest same week" ON public.weekly_hosts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.weekly_guests wg
      WHERE wg.user_id = weekly_hosts.user_id
        AND wg.week_of = weekly_hosts.week_of
    )
  );

-- 3. Can't reactivate a cancelled host entry while signed up as a guest.
-- USING is evaluated against the existing row: non-cancelled rows stay
-- editable (legacy dual host+guest state keeps working), but a cancelled row
-- can only be updated when no guest signup exists for that week.
CREATE POLICY "No host reactivation when guest same week" ON public.weekly_hosts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    status <> 'cancelled'
    OR NOT EXISTS (
      SELECT 1 FROM public.weekly_guests wg
      WHERE wg.user_id = weekly_hosts.user_id
        AND wg.week_of = weekly_hosts.week_of
    )
  )
  WITH CHECK (true);

-- Capacity helpers. SECURITY DEFINER (mirroring public.is_admin) because RLS
-- policy subqueries run with the caller's privileges and non-admins cannot
-- read other guests' weekly_guests rows, so the sums must bypass RLS.
CREATE OR REPLACE FUNCTION public.guest_fits_capacity(p_guest_id uuid, p_party_size int)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.match_guests mg
    JOIN public.matches m ON m.id = mg.match_id
    JOIN public.weekly_hosts wh ON wh.id = m.host_id
    WHERE mg.guest_id = p_guest_id
      AND p_party_size + COALESCE((
        SELECT SUM(wg.party_size)
        FROM public.match_guests mg2
        JOIN public.weekly_guests wg ON wg.id = mg2.guest_id
        WHERE mg2.match_id = m.id
          AND mg2.guest_id <> p_guest_id
      ), 0) > wh.seats_available
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.host_booked_seats(p_host_id uuid)
RETURNS int AS $$
  SELECT COALESCE(SUM(wg.party_size), 0)::int
  FROM public.matches m
  JOIN public.match_guests mg ON mg.match_id = m.id
  JOIN public.weekly_guests wg ON wg.id = mg.guest_id
  WHERE m.host_id = p_host_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. Matched guests can't grow party_size beyond the host's remaining capacity.
-- Unmatched guests (no match_guests row) always pass.
CREATE POLICY "Party size must fit host capacity" ON public.weekly_guests
  AS RESTRICTIVE FOR UPDATE TO authenticated
  WITH CHECK (public.guest_fits_capacity(id, party_size));

-- 5. Hosts can't reduce seats_available below currently booked seats.
CREATE POLICY "Seats cannot drop below booked seats" ON public.weekly_hosts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  WITH CHECK (seats_available >= public.host_booked_seats(id));
