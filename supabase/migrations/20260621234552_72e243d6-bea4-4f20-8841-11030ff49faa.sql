
drop policy if exists "profiles_read_all" on public.profiles;

create policy "profiles_read_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "profiles_read_friends" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.friends f
      where f.owner_id = auth.uid() and f.friend_id = public.profiles.id
    )
  );

create or replace function public.lookup_profile_by_code(_code text)
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where friend_code = upper(trim(_code)) limit 1;
$$;

revoke execute on function public.lookup_profile_by_code(text) from public, anon;
grant execute on function public.lookup_profile_by_code(text) to authenticated;
