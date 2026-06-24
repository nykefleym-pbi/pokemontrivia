
CREATE TABLE public.mega_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  accuracy numeric(5,2) NOT NULL,
  correct integer NOT NULL,
  total integer NOT NULL,
  time_ms integer NOT NULL,
  trainer_name text NOT NULL,
  trainer_sprite text NOT NULL,
  level integer NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mega_runs_user_event_unique UNIQUE (user_id, event_id)
);

CREATE INDEX mega_runs_event_rank_idx ON public.mega_runs (event_id, accuracy DESC, time_ms ASC);

GRANT SELECT, INSERT, UPDATE ON public.mega_runs TO authenticated;
GRANT ALL ON public.mega_runs TO service_role;

ALTER TABLE public.mega_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mega_runs_read_all" ON public.mega_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mega_runs_insert_own" ON public.mega_runs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mega_runs_update_own" ON public.mega_runs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
