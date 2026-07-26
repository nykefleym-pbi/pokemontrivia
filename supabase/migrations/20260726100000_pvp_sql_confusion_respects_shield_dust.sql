-- Shield Dust must block confusion in the SQL that actually persists it.
--
-- Migration 20260726060000 (PR #209) added `preventsConfusion` to the engine,
-- and the engine is where the BOT's confusion comes from — `apply_bot_pvp_move_v2`
-- stores `_next_state->>'confusedTicksLive'` verbatim. The human path does not.
-- `apply_pvp_live_answer_v2` recomputes the same three confusion rules in
-- PL/pgSQL and writes its own answer, ignoring `_next_state` for this one
-- column:
--
--     v_confused_ticks := case when v_wrong_streak = 2 then 2
--                              else v_confused_ticks_before end;
--
-- So the engine fix, its unit tests and the type-checker were all green while
-- production kept arming confusion on a Shield Dust partner (observed:
-- host_ability_id 'shield-dust' with host_confused_ticks_live 1 and 2 in two
-- consecutive matches). Nothing in TypeScript can see this statement.
--
-- The guard is added here rather than switching the human path to `_next_state`
-- wholesale: that would be the better end state — one implementation instead of
-- two — but it silently changes the other two confusion rules as well, and this
-- is a targeted fix for a live bug. The duplication is now noted in CLAUDE.md.

/**
 * Abilities immune to the consecutive-wrong -> Confused chain.
 *
 * A function rather than an inline literal so the SQL and TypeScript sides name
 * the rule in one place each, and a future second immune ability is a one-line
 * change here instead of a hunt through the answer resolvers. Mirrors
 * `typeAbilityPreventsConfusion` in src/lib/pvp-type-abilities.ts — keep the two
 * in step.
 */
create or replace function public._pvp_ability_prevents_confusion(_ability_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(_ability_id, '') = 'shield-dust';
$$;

do $$
declare
  def text;
  src text;
  target constant text :=
    'v_confused_ticks := case when v_wrong_streak = 2 then 2 else v_confused_ticks_before end;';
  fixed constant text :=
    'v_confused_ticks := case when v_wrong_streak = 2 '
    || 'and not public._pvp_ability_prevents_confusion(v_my_ability_id) then 2 '
    || 'else v_confused_ticks_before end;';
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_pvp_live_answer_v2';

  if def is null then
    raise exception 'apply_pvp_live_answer_v2 not found';
  end if;

  -- Already guarded (re-run, or the function was rewritten upstream).
  if position('_pvp_ability_prevents_confusion' in def) > 0 then
    raise notice 'apply_pvp_live_answer_v2 already respects the guard';
    return;
  end if;

  if position(target in def) = 0 then
    raise exception
      'confusion-arming statement not found in apply_pvp_live_answer_v2 — it was rewritten; re-derive the patch';
  end if;

  src := replace(def, target, fixed);
  execute src;
  raise notice 'apply_pvp_live_answer_v2 now respects Shield Dust';
end $$;
