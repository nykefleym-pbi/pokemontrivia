-- Every RPC that returns HP now also returns the row's `rev`.
--
-- Why: the client learns HP from two unordered channels — each write's own
-- response, and the postgres_changes event that write emits. `rev` already let
-- the client drop a stale realtime row (migration 20260726030000), but a stale
-- *response* had nothing to compare against, so whichever callback happened to
-- run last won. That is visible as the HP bars jumping backwards and forwards,
-- and it does not need any item or ability to trigger it — two answers resolving
-- close together is enough.
--
-- With `rev` on the response, the client can put BOTH channels behind one
-- high-water mark and simply ignore anything older than what it has drawn.
--
-- Applied as a textual patch over the live definitions rather than eight
-- hand-copied `create or replace` blocks: these are long, hand-tuned functions
-- (the two answer resolvers alone run to hundreds of lines) and retyping them to
-- append one key to a `jsonb_build_object` is how a transcription slip gets in.
-- The patch is anchored on an exact literal that appears only in the return
-- payloads, is verified to match all eight functions before running, and is
-- guarded so re-running it is a no-op.
do $$
declare
  f record;
  src text;
  patched int := 0;
begin
  for f in
    select p.oid, p.proname::text as name, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and position('''hostHp'', v_match.host_hp' in pg_get_functiondef(p.oid)) > 0
  loop
    -- Idempotent: a function that already reports `rev` is left alone.
    if position('''rev'', v_match.rev' in f.def) > 0 then
      continue;
    end if;
    src := replace(
      f.def,
      '''hostHp'', v_match.host_hp',
      '''rev'', v_match.rev, ''hostHp'', v_match.host_hp'
    );
    if src = f.def then
      raise exception 'rev patch did not apply to %', f.name;
    end if;
    execute src;
    patched := patched + 1;
    raise notice 'patched % to return rev', f.name;
  end loop;

  -- All eight HP-returning functions were present when this was written. Fewer
  -- means one drifted out of the pattern and is silently still unordered, which
  -- is exactly the failure this migration exists to remove.
  if patched <> 8 then
    raise exception 'expected to patch 8 functions, patched %', patched;
  end if;
end $$;
