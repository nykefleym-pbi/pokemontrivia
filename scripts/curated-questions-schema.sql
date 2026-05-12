-- Reference copy of the migration that created the curated_questions table.
-- Already applied via Lovable Cloud migrations. Kept here for documentation
-- and for re-applying to a fresh Supabase project if needed.

CREATE TABLE IF NOT EXISTS public.curated_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
  explanation TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
  type_theme TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  times_served INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_curated_difficulty_verified
  ON public.curated_questions (difficulty, verified) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_curated_type_theme_verified
  ON public.curated_questions (type_theme, verified) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_curated_category
  ON public.curated_questions (category);

ALTER TABLE public.curated_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read verified curated questions"
  ON public.curated_questions FOR SELECT
  USING (verified = TRUE);

CREATE POLICY "Anyone can update counters on verified rows"
  ON public.curated_questions FOR UPDATE
  USING (verified = TRUE)
  WITH CHECK (verified = TRUE);

CREATE OR REPLACE FUNCTION public.increment_curated_served(question_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.curated_questions
  SET times_served = times_served + 1
  WHERE id = ANY(question_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_curated_correct(question_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.curated_questions
  SET times_correct = times_correct + 1
  WHERE id = question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_curated_served(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_curated_correct(UUID) TO anon, authenticated;
