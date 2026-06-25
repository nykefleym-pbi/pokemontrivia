
-- 1. Remove permissive public SELECT exposing correct_index/explanation.
DROP POLICY IF EXISTS "Public can read verified curated questions" ON public.curated_questions;

-- (Keep ENABLE RLS on; no SELECT policy = no direct table reads from clients.)

-- 2. SECURITY DEFINER RPC: return only renderable fields, never answer/explanation.
CREATE OR REPLACE FUNCTION public.get_curated_questions(
  _difficulty text DEFAULT NULL,
  _type_theme text DEFAULT NULL,
  _category text DEFAULT NULL,
  _exclude uuid[] DEFAULT '{}',
  _limit int DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  question text,
  options jsonb,
  category text,
  difficulty text,
  type_theme text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, question, options, category, difficulty, type_theme
  FROM public.curated_questions
  WHERE verified = TRUE
    AND (_difficulty IS NULL OR difficulty = _difficulty)
    AND (_type_theme IS NULL OR type_theme = _type_theme)
    AND (_category IS NULL OR category = _category)
    AND (_exclude IS NULL OR NOT (id = ANY(_exclude)))
  ORDER BY random()
  LIMIT greatest(1, least(coalesce(_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.get_curated_questions(text, text, text, uuid[], int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_curated_questions(text, text, text, uuid[], int) TO anon, authenticated;

-- 3. SECURITY DEFINER RPC: score one answer; reveal only after submission.
CREATE OR REPLACE FUNCTION public.check_curated_answer(
  _question_id uuid,
  _chosen_index int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_correct int;
  v_explanation text;
BEGIN
  SELECT correct_index, explanation
    INTO v_correct, v_explanation
  FROM public.curated_questions
  WHERE id = _question_id AND verified = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'correct', (_chosen_index = v_correct),
    'correct_index', v_correct,
    'explanation', v_explanation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_curated_answer(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.check_curated_answer(uuid, int) TO anon, authenticated;
