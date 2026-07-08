-- Nearby Battle forfeit fix (feedback 45f613c7).
--
-- forfeit_live_pvp_match originally always set winner_id = caller, which is
-- correct for the presence-timeout path ("opponent has been gone 30s, I claim
-- the win") but WRONG for the forfeit button / back-button ("I give up"): a
-- conceding player was recorded as the winner and collected the berry rewards.
--
-- Add a _concede flag. When true (the player is giving up), the OPPONENT is the
-- winner. When false/omitted (the legacy presence-timeout claim), the caller is
-- the winner exactly as before, so existing callers are unaffected.
create or replace function public.forfeit_live_pvp_match(_match_id uuid, _concede boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_winner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_uid not in (v_match.host_id, v_match.guest_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_match.status != 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  -- Conceding hands the win to the opponent; a presence-timeout claim keeps it
  -- with the caller.
  if _concede then
    v_winner := case when v_uid = v_match.host_id then v_match.guest_id else v_match.host_id end;
  else
    v_winner := v_uid;
  end if;

  update public.pvp_live_matches
     set status = 'forfeited', winner_id = v_winner
   where id = _match_id and status = 'active';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.forfeit_live_pvp_match(uuid, boolean) to authenticated;
