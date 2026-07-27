-- A reason to come back for a person rather than a mode.
--
-- Nothing in the app has ever ranked one player against another. The only
-- global board is Mega Raid, which is a solo score attack against a boss; PvP
-- had no rating of any kind, so beating someone changed nothing that persisted
-- and there was no rival to chase.
--
-- Elo, applied by a TRIGGER rather than by whatever code happens to finish a
-- match. Matches end down several paths — both sides finishing, a forfeit, the
-- AFK timeout — and a rule that lives in one of them silently misses the
-- others. (This codebase has been bitten by exactly that: a per-answer rule
-- added to the engine took effect for the bot and did nothing for the player,
-- because the human path recomputes its own state in PL/pgSQL.) A trigger on
-- the row is the one place every path must pass through.
--
-- Bot matches are excluded: a rating you can farm off a bot is not a rating.
-- Seasons are deliberately NOT built yet — a reset only means something once
-- there is enough traffic for a ladder to go stale, and building the rollover
-- now would be machinery with nothing to do.

alter table public.profiles
  add column if not exists rating integer not null default 1000,
  add column if not exists rating_matches integer not null default 0;

comment on column public.profiles.rating is
  'Elo against other humans. Bot matches never touch it.';
comment on column public.profiles.rating_matches is
  'Rated matches played — lets the board hide provisional ratings.';

create index if not exists profiles_rating_idx on public.profiles (rating desc);

create or replace function public.apply_pvp_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  k constant numeric := 24;
  v_host integer;
  v_guest integer;
  v_expected_host numeric;
  v_score_host numeric;
begin
  -- Only when a HUMAN match reaches a terminal state, and only on the
  -- transition — an already-finished row being touched again must not re-rate.
  if new.is_bot_match then return new; end if;
  if new.status not in ('completed', 'forfeited') then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  select rating into v_host from public.profiles where id = new.host_id for update;
  select rating into v_guest from public.profiles where id = new.guest_id for update;
  if v_host is null or v_guest is null then return new; end if;

  v_expected_host := 1.0 / (1.0 + power(10.0, (v_guest - v_host) / 400.0));
  v_score_host := case
    when new.winner_id = new.host_id then 1.0
    when new.winner_id = new.guest_id then 0.0
    else 0.5  -- a tie, and a forfeit with no winner recorded
  end;

  update public.profiles
     set rating = greatest(100, round(v_host + k * (v_score_host - v_expected_host))::int),
         rating_matches = rating_matches + 1
   where id = new.host_id;

  update public.profiles
     set rating = greatest(100, round(v_guest + k * ((1.0 - v_score_host) - (1.0 - v_expected_host)))::int),
         rating_matches = rating_matches + 1
   where id = new.guest_id;

  return new;
end;
$function$;

drop trigger if exists apply_pvp_rating_trg on public.pvp_live_matches;
create trigger apply_pvp_rating_trg
  after update on public.pvp_live_matches
  for each row
  execute function public.apply_pvp_rating();

-- ── The board ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER because RLS on profiles keeps players from reading each
-- other, and a leaderboard is the one place that has to. Only the columns a
-- board needs are returned — no ids beyond what the client already shows, and
-- nothing that would turn the board into a user directory.
create or replace function public.get_pvp_leaderboard(_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_top jsonb;
  v_me jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top
  from (
    select p.id, p.trainer_name, p.trainer_sprite, p.level, p.rating, p.rating_matches,
           rank() over (order by p.rating desc) as position
    from public.profiles p
    where p.rating_matches > 0
      and p.trainer_name is not null
      and p.id <> 'b07b07b0-7b07-4b07-8b07-b07b07b07b07'
    order by p.rating desc
    limit greatest(1, least(coalesce(_limit, 20), 100))
  ) t;

  -- The caller's own standing, whether or not they made the cut.
  select row_to_json(m)::jsonb into v_me
  from (
    select p.id, p.trainer_name, p.trainer_sprite, p.level, p.rating, p.rating_matches,
           (select count(*) + 1 from public.profiles q
             where q.rating > p.rating and q.rating_matches > 0
               and q.id <> 'b07b07b0-7b07-4b07-8b07-b07b07b07b07') as position
    from public.profiles p
    where p.id = v_uid
  ) m;

  return jsonb_build_object('ok', true, 'top', v_top, 'me', v_me);
end;
$function$;

revoke all on function public.get_pvp_leaderboard(integer) from public;
grant execute on function public.get_pvp_leaderboard(integer) to authenticated;
