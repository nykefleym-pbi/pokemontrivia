-- Challenge a trainer you have never met, asynchronously.
--
-- The live queue (20260726150000) only pairs two people who are both waiting at
-- the same moment. With a handful of players that is almost never — so the mode
-- that actually finds a human is the one that does not need them present.
--
-- Everything for that already exists and is live: pvp_matches freezes a question
-- set, each side answers whenever, and both the challenge and the result are
-- push-notified. It was simply gated to friends, and there are no friends
-- (production: 0 rows in `friends`). This adds a second, deliberately separate
-- entry point rather than loosening create_pvp_challenge's friends check, so
-- the friend path keeps its guarantee.
--
-- Opponent selection is server-side and the candidate list is never returned:
-- the caller learns who they drew only after the challenge is issued, so this
-- cannot be used to enumerate the player base.

create or replace function public.challenge_random_trainer(_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_level integer;
  v_bot_id uuid := 'b07b07b0-7b07-4b07-8b07-b07b07b07b07';
  v_pending integer;
  v_opponent public.profiles;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select level into v_level from public.profiles where id = v_uid;
  if v_level is null then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  -- A stranger-challenge button with no cap is a way to spam every player in
  -- the game from one tap. Three unanswered challenges out at once is plenty.
  select count(*) into v_pending
  from public.pvp_matches
  where challenger_id = v_uid and status = 'pending' and expires_at > now();
  if v_pending >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_pending');
  end if;

  -- Closest level first, ties broken at random. Excluded: me, the shared
  -- Training Bot, anyone who never claimed a name (they never finished
  -- onboarding and will never answer), and anyone I already have a challenge
  -- sitting with — being challenged repeatedly by the same stranger is
  -- harassment-shaped even when it is only trivia.
  select * into v_opponent
  from public.profiles p
  where p.id <> v_uid
    and p.id <> v_bot_id
    and p.trainer_name is not null
    and length(trim(p.trainer_name)) > 0
    and not exists (
      select 1 from public.pvp_matches m
      where m.challenger_id = v_uid
        and m.opponent_id = p.id
        and m.status = 'pending'
        and m.expires_at > now()
    )
  order by abs(coalesce(p.level, 1) - v_level), random()
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_opponent');
  end if;

  insert into public.pvp_matches (challenger_id, opponent_id, questions)
  values (v_uid, v_opponent.id, _questions)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_id,
    'opponent', jsonb_build_object(
      'id', v_opponent.id,
      'trainer_name', v_opponent.trainer_name,
      'trainer_sprite', v_opponent.trainer_sprite,
      'level', v_opponent.level
    )
  );
end;
$function$;

revoke all on function public.challenge_random_trainer(jsonb) from public;
grant execute on function public.challenge_random_trainer(jsonb) to authenticated;
