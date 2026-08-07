-- ============================================================
-- Real Supabase Auth: link team_members to auth.users
-- ------------------------------------------------------------
-- The login/sign-up screen now uses Supabase Auth for real
-- (instead of the app-only local gate). Each team member's row
-- in `team_members` is keyed by their Supabase Auth user id, and
-- is created automatically the first time they sign in — via the
-- trigger below — so you don't have to do anything manual.
-- ============================================================

-- Let a signed-in user manage their OWN profile row directly
-- (in addition to the existing "authenticated_all" policy, which
-- already allows authenticated users full access to team_members).
drop policy if exists "self_upsert_profile" on public.team_members;
create policy "self_upsert_profile" on public.team_members
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "self_update_profile" on public.team_members;
create policy "self_update_profile" on public.team_members
  for update to authenticated using (auth.uid() = id);

-- Auto-create a team_members row when someone signs up via
-- Supabase Auth (email/password or Google/Apple, once enabled).
-- Uses the name passed at sign-up (see js/auth.js) or falls back
-- to the email's local part.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.team_members (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'sales'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Done. Sign up in the app now creates a real Supabase Auth account
-- AND a matching team_members profile automatically. 🎈
