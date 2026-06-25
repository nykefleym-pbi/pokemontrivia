
-- 1) Clear friendships
delete from public.friends;

-- 2) Dedupe profiles by lower(trainer_name): keep latest updated_at, tiebreak by id
with ranked as (
  select id, row_number() over (
    partition by lower(trainer_name)
    order by updated_at desc, id desc
  ) as rn
  from public.profiles
)
delete from public.profiles p
using ranked r
where p.id = r.id and r.rn > 1;

-- Dedupe by friend_code (should be unique already, but defensive)
with ranked as (
  select id, row_number() over (
    partition by friend_code
    order by updated_at desc, id desc
  ) as rn
  from public.profiles
)
delete from public.profiles p
using ranked r
where p.id = r.id and r.rn > 1;

-- 3) Uniqueness constraint on lower(trainer_name)
create unique index if not exists profiles_trainer_name_lower_key
  on public.profiles (lower(trainer_name));

-- B) RPCs
create or replace function public.is_trainer_name_available(_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(trainer_name) = lower(btrim(_name))
      and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

create or replace function public.claim_trainer_name(_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(_name, ''));
  v_len int;
  v_exists boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;
  v_len := char_length(v_name);
  if v_len < 3 or v_len > 16 then
    return jsonb_build_object('ok', false, 'error', 'length');
  end if;
  if v_name !~ '^[A-Za-z0-9 _-]+$' then
    return jsonb_build_object('ok', false, 'error', 'chars');
  end if;

  select exists(select 1 from public.profiles where id = v_uid) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  if exists (
    select 1 from public.profiles
    where lower(trainer_name) = lower(v_name) and id <> v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  begin
    update public.profiles
       set trainer_name = v_name, updated_at = now()
     where id = v_uid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.is_trainer_name_available(text) to anon, authenticated;
grant execute on function public.claim_trainer_name(text) to anon, authenticated;
