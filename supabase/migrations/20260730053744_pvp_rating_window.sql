-- A ranked board CENTRED ON THE CALLER, rather than the top N.
--
-- Owner request: "PvP ranking should only show 3 names where the user's account
-- is always included. It always show the top player above the user and the lower
-- player below the user based on ELO unless the user is the 1st or the 3rd in
-- rankings."
--
-- This is a NEW function rather than a change to get_pvp_leaderboard, which stays
-- exactly as it is: that one is live, a cached PWA shell from an older deploy is
-- still calling it, and the Arena is not the only thing that could want a plain
-- top N. Same precedent as pick_battle_curated's array overload.
--
-- The window cannot be computed client-side. A player ranked #40 has neighbours
-- at #39 and #41, and no top-N fetch small enough to be worth doing contains
-- them; only the database can seek to the caller's position.
--
-- Clamping is what makes "unless the user is the 1st or the last" work: the start
-- of the window is pulled back so a full _size rows are still returned at either
-- end. #1 gives rows 1..3, and the last-placed player gives the final three
-- rather than two rows and a gap. With fewer ranked players than _size (there are
-- 2 in production right now, since rating only moves on human matches) it simply
-- returns everyone.
--
-- `ranked` is false for a caller with no standing yet -- rating_matches = 0, i.e.
-- every match so far was against the Training Bot. There is no position to centre
-- on, so the caller gets the top _size instead and the client can say so.

create or replace function public.get_pvp_rating_window(_size integer default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  -- The Training Bot is excluded from every count and every row, exactly as
  -- get_pvp_leaderboard excludes it.
  c_bot constant uuid := 'b07b07b0-7b07-4b07-8b07-b07b07b07b07';
  v_uid uuid := auth.uid();
  v_size int := greatest(1, least(coalesce(_size, 3), 25));
  v_total int;
  v_rn int;
  v_start int;
  v_rows jsonb;
  v_me jsonb;
begin
  -- rank() is what gets DISPLAYED, so tied ratings share a position. row_number()
  -- is what the window is cut on, because two players on the same rating still
  -- need a stable order to slice.
  with ranked as (
    select p.id,
           row_number() over (order by p.rating desc, p.id) as rn
    from public.profiles p
    where p.rating_matches > 0
      and p.trainer_name is not null
      and p.id <> c_bot
  )
  select count(*), max(case when r.id = v_uid then r.rn end)
    into v_total, v_rn
  from ranked r;

  if v_total = 0 then
    return jsonb_build_object('ok', true, 'ranked', false, 'total', 0,
                              'rows', '[]'::jsonb, 'me', null);
  end if;

  v_start := case
    when v_rn is null then 1
    -- one row above for _size = 3; the least() pulls the window back off the
    -- bottom edge, the greatest() off the top.
    else greatest(1, least(v_rn - ((v_size - 1) / 2), v_total - v_size + 1))
  end;

  with ranked as (
    select p.id, p.trainer_name, p.trainer_sprite, p.level, p.rating, p.rating_matches,
           rank() over (order by p.rating desc) as position,
           row_number() over (order by p.rating desc, p.id) as rn
    from public.profiles p
    where p.rating_matches > 0
      and p.trainer_name is not null
      and p.id <> c_bot
  )
  select coalesce(jsonb_agg(row_to_json(t) order by t.rn), '[]'::jsonb) into v_rows
  from (
    select r.id, r.trainer_name, r.trainer_sprite, r.level, r.rating, r.rating_matches,
           r.position, r.rn,
           (r.id = v_uid) as is_me
    from ranked r
    where r.rn between v_start and v_start + v_size - 1
  ) t;

  -- The caller's own row travels separately as well, so a client can show "you"
  -- even when the caller has no standing and the rows above are just the top N.
  select row_to_json(m)::jsonb into v_me
  from (
    select p.id, p.trainer_name, p.trainer_sprite, p.level, p.rating, p.rating_matches,
           (select count(*) + 1 from public.profiles q
             where q.rating > p.rating and q.rating_matches > 0 and q.id <> c_bot) as position
    from public.profiles p
    where p.id = v_uid
  ) m;

  return jsonb_build_object('ok', true, 'ranked', v_rn is not null,
                            'total', v_total, 'rows', v_rows, 'me', v_me);
end;
$function$;

revoke execute on function public.get_pvp_rating_window(integer) from public, anon;
grant execute on function public.get_pvp_rating_window(integer) to authenticated, service_role;
