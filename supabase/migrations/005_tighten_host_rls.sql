-- Remove broad read access to weekly_hosts (exposes addresses)
DROP POLICY IF EXISTS "Authenticated users can read hosts" ON public.weekly_hosts;
DROP POLICY IF EXISTS "Users can manage own host entries" ON public.weekly_hosts;

-- Replace with a single policy: own entries, matched guests, or admin
CREATE POLICY "Users can manage own host entries" ON public.weekly_hosts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Matched guests can read their host" ON public.weekly_hosts
  FOR SELECT USING (
    auth.uid() IN (
      SELECT wg.user_id FROM public.weekly_guests wg
      JOIN public.match_guests mg ON mg.guest_id = wg.id
      JOIN public.matches m ON m.id = mg.match_id
      WHERE m.host_id = weekly_hosts.id
    )
    OR public.is_admin(auth.uid())
  );
