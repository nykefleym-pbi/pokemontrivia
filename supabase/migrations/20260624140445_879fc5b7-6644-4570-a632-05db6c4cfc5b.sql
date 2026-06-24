-- 1. Roster of Mega events (source of truth; add a new Mega = insert a row)
create table public.mega_events (
  id text primary key,
  mega_id integer not null,
  name text not null,
  base_name text not null,
  base_dex_id integer not null,
  types text[] not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  win_xp integer not null default 500,
  win_tp integer not null default 150,
  win_items integer not null default 5,
  champ_xp integer not null default 2500,
  champ_tp integer not null default 500,
  champ_items integer not null default 10,
  trophy_id text not null,
  trophy_name text not null,
  created_at timestamptz not null default now()
);
create index mega_events_window_idx on public.mega_events (starts_at, ends_at);
alter table public.mega_events enable row level security;
grant select on public.mega_events to authenticated;
create policy "mega_events_read_all" on public.mega_events for select to authenticated using (true);

-- 2. Frozen per-event question set (generated once, identical for everyone)
create table public.mega_event_questions (
  event_id text primary key references public.mega_events(id) on delete cascade,
  questions jsonb not null,
  generated_at timestamptz not null default now()
);
alter table public.mega_event_questions enable row level security;
grant select on public.mega_event_questions to authenticated;
create policy "mega_event_questions_read_all" on public.mega_event_questions for select to authenticated using (true);

-- 3. Attempts counter on mega_runs + FK to the roster
alter table public.mega_runs add column attempts integer not null default 0;
alter table public.mega_runs add constraint mega_runs_event_fk
  foreign key (event_id) references public.mega_events(id) on delete cascade;

-- 4. All writes go through a SECURITY DEFINER RPC so the attempt cap can't be bypassed.
drop policy if exists "mega_runs_insert_own" on public.mega_runs;
drop policy if exists "mega_runs_update_own" on public.mega_runs;

-- 5. Submit a finished run: enforces auth, active window, 2-attempt cap, and keep-best.
create or replace function public.submit_mega_run(
  p_event_id text,
  p_accuracy numeric,
  p_correct integer,
  p_total integer,
  p_time_ms integer
) returns public.mega_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_ev public.mega_events;
  v_row public.mega_runs;
  v_name text; v_sprite text; v_level integer;
  v_better boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_ev from public.mega_events where id = p_event_id;
  if not found then raise exception 'unknown event'; end if;
  if v_now < v_ev.starts_at or v_now >= v_ev.ends_at then
    raise exception 'event not active';
  end if;

  select trainer_name, trainer_sprite, level
    into v_name, v_sprite, v_level
    from public.profiles where id = v_uid;

  select * into v_row from public.mega_runs where user_id = v_uid and event_id = p_event_id;

  if found then
    if v_row.attempts >= 2 then
      raise exception 'no attempts left';
    end if;
    v_better := p_accuracy > v_row.accuracy
                or (p_accuracy = v_row.accuracy and p_time_ms < v_row.time_ms);
    update public.mega_runs set
      attempts = v_row.attempts + 1,
      accuracy = case when v_better then p_accuracy else v_row.accuracy end,
      correct  = case when v_better then p_correct  else v_row.correct  end,
      total    = case when v_better then p_total    else v_row.total    end,
      time_ms  = case when v_better then p_time_ms  else v_row.time_ms  end,
      trainer_name   = coalesce(v_name, trainer_name),
      trainer_sprite = coalesce(v_sprite, trainer_sprite),
      level          = coalesce(v_level, level),
      finished_at    = v_now
    where user_id = v_uid and event_id = p_event_id
    returning * into v_row;
  else
    insert into public.mega_runs
      (user_id, event_id, accuracy, correct, total, time_ms, trainer_name, trainer_sprite, level, attempts, finished_at)
    values
      (v_uid, p_event_id, p_accuracy, p_correct, p_total, p_time_ms,
       coalesce(v_name,'Trainer'), coalesce(v_sprite,'red'), coalesce(v_level,1), 1, v_now)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;
grant execute on function public.submit_mega_run(text, numeric, integer, integer, integer) to authenticated;

-- 6. Seed the first event (Mega Charizard X).
insert into public.mega_events
  (id, mega_id, name, base_name, base_dex_id, types, starts_at, ends_at, trophy_id, trophy_name)
values
  ('mega-charizard-x-2026-06-23', 10034, 'Mega Charizard X', 'Charizard', 6, array['fire','dragon'],
   '2026-06-23T00:00:00Z', '2026-07-07T00:00:00Z', 'mega-charizard-x-slayer', 'Mega Charizard X Slayer')
on conflict (id) do nothing;