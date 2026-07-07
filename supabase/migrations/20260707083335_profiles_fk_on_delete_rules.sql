-- Allow deleting a profile without being blocked by leftover PvP references.
-- The three FKs to profiles(id) that had no ON DELETE action are given one,
-- matching the existing convention (participation refs cascade; the nullable
-- "winner" pointer is nulled so the match row itself survives).

-- Ephemeral live battle-effect log entries are owned by their source player.
alter table public.pvp_live_effects
  drop constraint pvp_live_effects_source_id_fkey,
  add constraint pvp_live_effects_source_id_fkey
    foreign key (source_id) references public.profiles(id) on delete cascade;

-- winner_id is a nullable pointer; clear it rather than block/delete the match.
alter table public.pvp_live_matches
  drop constraint pvp_live_matches_winner_id_fkey,
  add constraint pvp_live_matches_winner_id_fkey
    foreign key (winner_id) references public.profiles(id) on delete set null;

alter table public.pvp_matches
  drop constraint pvp_matches_winner_id_fkey,
  add constraint pvp_matches_winner_id_fkey
    foreign key (winner_id) references public.profiles(id) on delete set null;
