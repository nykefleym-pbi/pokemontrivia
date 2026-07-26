-- Battle questions are drawn from a BAND of difficulties, not a single tier.
--
-- Why: the bank is lopsided (easy 792, medium 1872, hard 944, expert 392), so a
-- single-tier draw handed a level-16+ trainer a 392-question pool. Worse, the
-- client's old difficultyForLevel() returned "master" at level 26+ — a value no
-- row carries and the API clamped to "easy", so the most invested players
-- silently got beginner questions.
--
-- This adds an ARRAY overload rather than replacing the scalar one. PostgREST
-- resolves the two by argument name (p_difficulty vs p_difficulties), and a
-- cached PWA shell from an older deploy is still calling the scalar version.
-- Drop the scalar one once no deployment serves it.
--
-- The ordering is the point of this function and is preserved verbatim:
-- `order by seen asc, random()` treats p_exclude as a PREFERENCE, so a drained
-- pool degrades into repeats instead of returning short and falling through to
-- the 30 bundled fallback questions.

create or replace function public.pick_battle_curated(
  p_difficulties text[],
  p_count integer,
  p_exclude uuid[] default '{}'::uuid[]
)
returns table (
  id uuid,
  question text,
  options jsonb,
  correct_index integer,
  explanation text,
  category text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pool as (
    select c.id, c.question, c.options, c.correct_index, c.explanation, c.category,
           (c.id = any(coalesce(p_exclude, '{}'::uuid[]))) as seen
    from public.curated_questions c
    where c.verified
      and c.difficulty = any(coalesce(p_difficulties, '{}'::text[]))
  )
  select id, question, options, correct_index, explanation, category
  from pool
  order by seen asc, random()
  limit p_count;
$function$;

grant execute on function public.pick_battle_curated(text[], integer, uuid[]) to anon, authenticated, service_role;
