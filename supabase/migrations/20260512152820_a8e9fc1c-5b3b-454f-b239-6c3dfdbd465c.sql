-- Curated Pokémon trivia questions
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

-- Counter RPCs
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

-- Seed 10 sample verified questions
INSERT INTO public.curated_questions (question, options, correct_index, explanation, category, difficulty, verified)
VALUES
  ('Which Pokémon is known as the Mythical Pokémon that lives inside the spirit world?',
   '["Mew", "Marshadow", "Hoopa", "Mewtwo"]'::jsonb, 1,
   'Marshadow is a Fighting/Ghost mythical Pokémon from the Alola region that lives in the shadows.',
   'Lore', 'hard', TRUE),
  ('What is the base happiness needed for Pokémon like Eevee to evolve into Espeon or Umbreon?',
   '["160", "180", "200", "220"]'::jsonb, 2,
   'Eevee requires a friendship/happiness value of at least 220 to evolve into Espeon (day) or Umbreon (night).',
   'Moves & Abilities', 'medium', TRUE),
  ('Which gym leader in Hoenn uses Steel-type Pokémon?',
   '["Wattson", "Norman", "Wallace", "Steven"]'::jsonb, 3,
   'While not technically a gym leader, Steven Stone is Hoenn''s Champion and specializes in Steel-types.',
   'Regions', 'expert', TRUE),
  ('How many Pokémon were introduced in Generation 1 (Red/Blue)?',
   '["150", "151", "152", "160"]'::jsonb, 1,
   'Generation 1 introduced 151 Pokémon, including the mythical Mew.',
   'Generations', 'easy', TRUE),
  ('In the Pokémon anime, who is Ash Ketchum''s main rival in Kanto?',
   '["Gary Oak", "Paul", "Trip", "Cameron"]'::jsonb, 0,
   'Gary Oak (Shigeru in Japanese) is Professor Oak''s grandson and Ash''s first major rival.',
   'Anime', 'easy', TRUE),
  ('Which item allows a Pokémon to hold an item that increases its critical-hit ratio?',
   '["Choice Band", "Scope Lens", "Focus Sash", "Leftovers"]'::jsonb, 1,
   'Scope Lens raises the holder''s critical-hit ratio by one stage.',
   'Items', 'medium', TRUE),
  ('What type combination does Mewtwo have?',
   '["Psychic / Fighting", "Psychic", "Psychic / Dark", "Psychic / Steel"]'::jsonb, 1,
   'Mewtwo is a pure Psychic-type. Its Mega and origin forms keep this typing.',
   'Pokédex', 'easy', TRUE),
  ('Which Pokémon was the first to be revealed for Pokémon Black and White?',
   '["Zorua", "Snivy", "Reshiram", "Zekrom"]'::jsonb, 0,
   'Zorua and Zoroark were the first Generation 5 Pokémon officially revealed, ahead of even the starters.',
   'Generations', 'hard', TRUE),
  ('What is the maximum number of Pokémon a single trainer can carry in their party?',
   '["4", "5", "6", "7"]'::jsonb, 2,
   'A trainer can carry up to 6 Pokémon in their active party at any time.',
   'Pokédex', 'easy', TRUE),
  ('Which move is unique to Pikachu — exclusive to it (and its line) and signature in main canon?',
   '["Thunderbolt", "Quick Attack", "Volt Tackle", "Thunder"]'::jsonb, 2,
   'Volt Tackle is Pikachu''s signature move, learned only by Pichu, Pikachu, and Raichu after breeding with a Light Ball.',
   'Moves & Abilities', 'medium', TRUE);