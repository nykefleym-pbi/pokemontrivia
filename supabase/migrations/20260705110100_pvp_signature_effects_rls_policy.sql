-- Read-only public catalog (mirrors the pvp_item_effects_rls_policy fix): allow
-- authenticated clients to read magnitudes; writes remain service_role only.
alter table public.pvp_signature_effects enable row level security;
create policy "pvp_signature_effects_select_authenticated" on public.pvp_signature_effects
  for select to authenticated using (true);
