-- Mega Raid: Mega Charizard Y, 15 Dec 2026 to 31 Jan 2027 (Paul, 2026-11-28).
-- Days are Philippine time (UTC+8): it opens at 00:00 on 15 Dec and closes at
-- the end of 31 Jan. PokéAPI form 10035 = charizard-mega-y (Fire/Flying).
insert into public.mega_events (id, mega_id, name, base_name, base_dex_id, types, starts_at, ends_at, trophy_id, trophy_name)
values (
  'mega-charizard-y-2026-12-15', 10035, 'Mega Charizard Y', 'Charizard', 6, array['fire', 'flying'],
  '2026-12-15T00:00:00+08:00', '2027-02-01T00:00:00+08:00',
  'mega-charizard-y-slayer', 'Mega Charizard Y Slayer'
)
on conflict (id) do nothing;
