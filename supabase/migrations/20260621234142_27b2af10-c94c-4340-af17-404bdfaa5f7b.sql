
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  friend_code text unique not null,
  trainer_name text not null default 'Trainer',
  trainer_sprite text not null default 'red',
  level int not null default 1,
  xp int not null default 0,
  pokedex_count int not null default 0,
  ace_pokemon_id int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

create or replace function public.gen_friend_code()
returns text language plpgsql set search_path = public as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text; i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end; $$;

create or replace function public.profiles_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.friend_code is null or new.friend_code = '') then
    new.friend_code := public.gen_friend_code();
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_profiles_before_write on public.profiles;
create trigger trg_profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

create table if not exists public.friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id)
);

grant select, insert, delete on public.friends to authenticated;
grant all on public.friends to service_role;

alter table public.profiles enable row level security;
alter table public.friends enable row level security;

create policy "profiles_read_all" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "friends_read_own" on public.friends
  for select to authenticated using (auth.uid() = owner_id);
create policy "friends_insert_own" on public.friends
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "friends_delete_own" on public.friends
  for delete to authenticated using (auth.uid() = owner_id);
