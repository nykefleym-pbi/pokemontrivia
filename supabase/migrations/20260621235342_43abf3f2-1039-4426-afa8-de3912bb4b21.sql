
create or replace function public.profiles_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text; i int;
begin
  if tg_op = 'INSERT' and (new.friend_code is null or new.friend_code = '') then
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.profiles where friend_code = code);
    end loop;
    new.friend_code := code;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop function if exists public.gen_friend_code();
