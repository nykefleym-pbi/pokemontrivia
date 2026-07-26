-- Strip parenthetical asides from curated question stems and answer options.
--
-- Why this is a leak and not just clutter: of the 90 questions carrying a
-- parenthesis in their OPTIONS, 83 had it on the correct option and 74 had it on
-- the correct option ONLY. A player who ignored the question entirely and picked
-- whichever option had a bracket in it would have scored ~92%. Examples:
--
--   "Individual Values (IVs)"                 vs  Effort Values / Base Stats / …
--   "Swords of Justice (Cobalion, Terrakion, …)" vs Tao trio / Kami trio / …
--   "Nincada (with empty slot and spare Ball)"  vs Ninjask / Surskit / Volbeat
--
-- Stems leaked too, sometimes naming the answer outright — one Curse question
-- read "…by one stage (Cosmic Power-like, but Gen II Curse for non-Ghosts)?"
-- with "Curse" as the answer. The most common stem aside, "(or type
-- combination)" (148 rows), was harmless, but it is removed with the rest:
-- leaving brackets anywhere keeps the bracket itself a signal worth noticing.
--
-- Explanations are deliberately left alone — they are only shown AFTER the
-- answer is locked in, so a parenthesis there gives nothing away.
--
-- Expressed as one deterministic regex rather than 360 hand-written updates, so
-- it is reviewable and idempotent (a second run finds no brackets to strip).
-- Reviewed before applying: no stem ends up empty or malformed, no option
-- collapses into a duplicate of a sibling, and the 11 rows whose asides could
-- have been load-bearing were checked individually — every one of them is still
-- uniquely answerable from the stem (the "(in Sword)" / "(in Shield)" Gym Leader
-- pairs are disambiguated by the type they specialise in; the
-- "(Black 2/White 2 only)" badges by their Gym Leader and city).
do $$
declare
  v_bad int;
  v_touched int;
begin
  -- The failure that would actually ruin the question set: `correct_index` is a
  -- position, so if rebuilding the options array reordered it, every affected
  -- question would silently start marking the wrong answer. Capture what the
  -- correct option MUST read afterwards, and refuse to commit if it doesn't.
  create temp table _paren_before on commit drop as
    select id,
           correct_index,
           btrim(regexp_replace(regexp_replace(options->>correct_index, '\s*\([^)]*\)', '', 'g'),
                                '\s+', ' ', 'g')) as expected_correct
    from public.curated_questions
    where question ~ '\(' or options::text ~ '\(';

  select count(*) into v_touched from _paren_before;

  update public.curated_questions c
  set question = btrim(regexp_replace(regexp_replace(c.question, '\s*\([^)]*\)', '', 'g'),
                                      '\s+', ' ', 'g')),
      options = (
        select jsonb_agg(
                 btrim(regexp_replace(regexp_replace(o.value, '\s*\([^)]*\)', '', 'g'),
                                      '\s+', ' ', 'g'))
                 order by o.ord)
        from jsonb_array_elements_text(c.options) with ordinality o(value, ord)
      )
  where c.question ~ '\(' or c.options::text ~ '\(';

  select count(*) into v_bad
  from _paren_before b
  join public.curated_questions c on c.id = b.id
  where c.options->>b.correct_index is distinct from b.expected_correct;

  if v_bad > 0 then
    raise exception 'correct answer moved for % of % rows — option order was not preserved',
      v_bad, v_touched;
  end if;

  -- Every question must still offer exactly four choices.
  select count(*) into v_bad
  from public.curated_questions
  where jsonb_array_length(options) <> 4;
  if v_bad > 0 then
    raise exception '% rows no longer have exactly 4 options', v_bad;
  end if;

  raise notice 'stripped parentheses from % rows', v_touched;
end $$;
