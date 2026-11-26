grant update(display_name) on public.profiles to authenticated;
create policy edit_own_display_name on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- The existing owner_settings policy checks ownership for both old and new rows.
grant update(name) on public.restaurants to authenticated;
