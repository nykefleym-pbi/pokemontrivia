-- Monotonic revision counter on pvp_live_matches, so a client can tell a stale
-- realtime row from a fresh one.
--
-- The bug this closes: a single turn writes the row several times (the answer
-- RPC, the bot's move, each signature effect). Every write emits a
-- postgres_changes event, and the client also applies HP straight from each
-- RPC's HTTP response. Those two channels are not ordered relative to each
-- other, so an event describing an *earlier* write can land after a later
-- response has already been applied — and the client would take the older HP.
-- Because the damage flash only fires when HP drops, that reads to the player
-- as their Pokémon spontaneously gaining HP.
--
-- A revision is enough to fix it because every payload carries the whole row:
-- skipping a stale or intermediate revision is always safe (the next one is
-- complete), while going backwards never is. So the client keeps a high-water
-- mark and drops anything at or below it.
--
-- Implemented as a BEFORE UPDATE trigger rather than by editing the apply_*
-- RPCs: those are long, hand-tuned functions with dozens of return sites, and a
-- trigger covers every writer that exists now or later — RPCs, Edge Functions,
-- and any manual repair done from the SQL editor — with no chance of one path
-- being missed.

alter table public.pvp_live_matches
  add column if not exists rev bigint not null default 0;

create or replace function public.pvp_live_matches_bump_rev()
returns trigger
language plpgsql
as $$
begin
  -- Unconditional: any update is a new revision, including ones that touch no
  -- HP column. The client only compares revisions, never interprets the gap, so
  -- bumping on writes that changed nothing observable costs nothing and keeps
  -- the rule "one update, one revision" simple enough to reason about.
  new.rev := old.rev + 1;
  return new;
end;
$$;

drop trigger if exists trg_pvp_live_matches_bump_rev on public.pvp_live_matches;

create trigger trg_pvp_live_matches_bump_rev
  before update on public.pvp_live_matches
  for each row
  execute function public.pvp_live_matches_bump_rev();
