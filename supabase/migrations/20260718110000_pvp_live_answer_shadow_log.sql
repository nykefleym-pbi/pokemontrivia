-- Live PvP Phase 4a: shadow-log for the ability-damage-magnitude recompute
-- (see /root/.claude/plans/prancy-spinning-sedgewick.md, Phase 4).
--
-- Purely observational, zero behavior change. The next migration extends
-- `submit_pvp_live_answer` to additionally INSERT one row per answer here:
-- a snapshot of every input `engine/pvp-live-answer.ts`'s `resolvePvpAnswer`
-- needs (pre-answer stages/statuses/sig_runtime/sig_state/streak/wrong-streak/
-- confused-ticks/dex ids/suppression window/question), plus the client's
-- self-reported outcome. A separate, offline verifier (Phase 4b) replays real
-- production answers through the ported engine and checks the client's
-- reported damage lands in the small {crit, non-crit} set the port
-- deterministically produces from the same inputs -- proving the port is
-- correct against real traffic BEFORE any of it goes anywhere near the hot
-- path (the new Edge Function / service-role apply RPC / client cutover).
--
-- No authenticated grants: written only by `submit_pvp_live_answer` (security
-- definer), read only by the offline verifier over a service-role/direct-DB
-- connection.
create table if not exists public.pvp_live_answer_shadow_log (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.pvp_live_matches(id) on delete cascade,
  question_index integer not null,
  side text not null check (side in ('host', 'guest')),
  created_at timestamptz not null default now(),
  -- The server-verified correctness this same call already computed
  -- (Phase 4 first slice) -- included so the verifier doesn't need to
  -- re-derive it from `questions` a second time.
  verified_correct boolean not null,
  -- Everything resolvePvpAnswer's PvpAnswerInput needs beyond the two flat
  -- columns above, as one blob rather than dozens of narrow columns -- this
  -- table only exists to feed an offline TS/Deno script, so the shape lives
  -- in application code, not the schema.
  runtime_snapshot jsonb not null,
  -- The client's self-reported correct/dmg/selfDmg/timeMs/selectedIndex --
  -- exactly what it sent to submit_pvp_live_answer, unmodified.
  client_report jsonb not null
);

create index if not exists pvp_live_answer_shadow_log_match_id_idx
  on public.pvp_live_answer_shadow_log (match_id);

alter table public.pvp_live_answer_shadow_log enable row level security;
