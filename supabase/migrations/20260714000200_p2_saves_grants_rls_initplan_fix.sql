-- Perf: RLS policies re-evaluate a bare auth.uid() once per row; wrapping it
-- in a scalar subquery lets the planner cache it for the whole statement
-- (Supabase database-linter 0003_auth_rls_initplan). saves/grants are on the
-- hot path for every save-sync/rewards-grant call, so worth doing here even
-- though most of the codebase's older policies still use the bare form —
-- that's a much larger, unrelated cleanup this migration doesn't attempt.
drop policy "saves_select_own" on public.saves;
create policy "saves_select_own" on public.saves
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "saves_insert_own" on public.saves;
create policy "saves_insert_own" on public.saves
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy "saves_update_own" on public.saves;
create policy "saves_update_own" on public.saves
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy "grants_select_own" on public.grants;
create policy "grants_select_own" on public.grants
  for select to authenticated
  using (user_id = (select auth.uid()));
