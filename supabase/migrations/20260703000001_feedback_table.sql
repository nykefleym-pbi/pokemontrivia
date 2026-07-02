-- User feedback (suggestions / bug reports). Write-only for users; read via
-- the Supabase dashboard only (no select policy).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  trainer_name text,
  category text not null check (category in ('suggestion', 'bug')),
  message text not null check (char_length(message) between 10 and 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
grant insert on public.feedback to authenticated;

create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());
