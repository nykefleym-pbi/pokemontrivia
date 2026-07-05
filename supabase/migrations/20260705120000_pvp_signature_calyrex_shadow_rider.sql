-- Phase 2: Shadow Rider Calyrex joins the roster as a distinct partner under the
-- synthetic forme id 10194 (Ice Rider Calyrex keeps dex 898). Its live signature
-- effect (As One — Spectral Reign / Grim Neigh) drains ~3 HP on each correct
-- answer — the same server-validated post_answer drain path as Spectrier (897)
-- and Yveltal (717), just a larger magnitude. The client can never supply the
-- magnitude; it's looked up here by dex id.
insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values
  (10194, 0, 'post_answer', 'opponent', 'drain', '{"amount":3}'::jsonb)
on conflict (pokemon_id, effect_index) do update
  set phase = excluded.phase,
      target = excluded.target,
      kind = excluded.kind,
      payload = excluded.payload;
