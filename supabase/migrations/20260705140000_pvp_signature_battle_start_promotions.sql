-- Promote two loadout-flavored abilities from bespoke to battle_start standing
-- buffs. Their loadout choice (Genesect's Drive, Ogerpon's Mask) is pure flavor
-- with no balancing cost, so a default standing self-buff is a faithful wiring:
--   Genesect (649) — Techno Blast: standing +1 Speed (default Shock drive).
--   Ogerpon  (1017) — Ivy Cudgel:  standing +1 Crit  (baseline Teal Mask).
-- The RPC already handles battle_start stat_stage effects (applied exactly once
-- per side via host/guest_ability_started); this only adds catalog rows. Kept in
-- lockstep with src/lib/signature-abilities.ts (scripts/gen-signature-sql.ts).
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (649, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"speed","delta":1}'::jsonb),
  (1017, 0, 'battle_start', 'self', 'stat_stage', '{"stat":"crit","delta":1}'::jsonb)
on conflict (pokemon_id, effect_index) do update
  set phase = excluded.phase, target = excluded.target,
      kind = excluded.kind, payload = excluded.payload;
