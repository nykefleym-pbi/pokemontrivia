
-- Remove the policy that exposed correct answers to all signed-in users.
DROP POLICY IF EXISTS "mega_event_questions_read_all" ON public.mega_event_questions;
REVOKE SELECT ON public.mega_event_questions FROM anon, authenticated;

-- Sanitized public read: questions without correct/explanation.
CREATE OR REPLACE FUNCTION public.get_mega_questions_public(p_event_id text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'question', q->>'question',
         'options', q->'options',
         'category', q->>'category'
       )
       ORDER BY ord
     )
     FROM public.mega_event_questions m,
          LATERAL jsonb_array_elements(m.questions) WITH ORDINALITY AS t(q, ord)
     WHERE m.event_id = p_event_id),
    '[]'::jsonb
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_mega_questions_public(text) TO anon, authenticated;

-- Reveal a single question's correct option + explanation on demand.
CREATE OR REPLACE FUNCTION public.reveal_mega_answer(p_event_id text, p_q_index int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_q_index IS NULL OR p_q_index < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_index');
  END IF;
  SELECT (questions -> p_q_index) INTO v
    FROM public.mega_event_questions WHERE event_id = p_event_id;
  IF v IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'correct_index', (v ->> 'correct')::int,
    'explanation', v ->> 'explanation'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.reveal_mega_answer(text, int) TO anon, authenticated;
