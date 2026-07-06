-- Phase 1/2: per-side jsonb for per-battle signature counters (Moltres Wrath).
alter table public.pvp_live_matches
  add column if not exists host_sig_state jsonb not null default '{}'::jsonb,
  add column if not exists guest_sig_state jsonb not null default '{}'::jsonb;

-- Moltres — Fiery Wrath (146): discharge inflicts Sleep (1q) on the opponent.
-- Chance is rolled client-side (30% per Wrath stack); the server applies the
-- fixed 1-question Sleep when told, exactly like Entei/Darkrai statuses.
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload)
values (146, 0, 'post_answer', 'opponent', 'status', '{"status":"sleep","questions":1}'::jsonb)
on conflict do nothing;

-- Raging Bolt — Thunderclap (1021): reactive pre-empt — +1 self Attack, -1 opp
-- Attack. Fired by the opponent-correct observer once every 4 of the caller's
-- questions (cooldown enforced client-side; magnitude fixed server-side).
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload)
values
  (1021, 0, 'post_answer', 'self', 'stat_stage', '{"stat":"attack","delta":1}'::jsonb),
  (1021, 1, 'post_answer', 'opponent', 'stat_stage', '{"stat":"attack","delta":-1}'::jsonb)
on conflict do nothing;
