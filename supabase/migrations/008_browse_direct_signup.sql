-- Add columns to weekly_guests for direct signup tracking
ALTER TABLE public.weekly_guests
  ADD COLUMN signup_type text NOT NULL DEFAULT 'match_pool'
    CHECK (signup_type IN ('match_pool', 'direct')),
  ADD COLUMN selected_host_id uuid REFERENCES public.weekly_hosts(id) ON DELETE SET NULL;

CREATE INDEX idx_weekly_guests_selected_host
  ON public.weekly_guests(selected_host_id) WHERE selected_host_id IS NOT NULL;

-- RLS: Allow all authenticated users to read weekly_hosts (for browsing)
DROP POLICY IF EXISTS "Matched guests can read their host" ON public.weekly_hosts;
CREATE POLICY "Authenticated users can read hosts"
  ON public.weekly_hosts FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS: Allow users to read names of active hosts
CREATE POLICY "Users can read host profiles"
  ON public.users FOR SELECT USING (
    id IN (SELECT wh.user_id FROM public.weekly_hosts wh WHERE wh.status != 'cancelled')
  );
