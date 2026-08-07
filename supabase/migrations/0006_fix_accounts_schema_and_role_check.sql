-- ============================================================
-- Fix two real bugs found while testing sign-up end to end:
--
-- 1) A table named `public.accounts` already existed in this
--    project (an unrelated demo table: id, name, slug, created_at)
--    BEFORE migration 0005 ran. Migration 0005's
--    `create table if not exists public.accounts (...)` was
--    therefore a silent no-op — it did NOT create the columns the
--    app actually needs (`owner_id`, `status`). Every sign-up that
--    founds a new company failed with "Database error saving new
--    user" because the trigger's `insert into accounts (name,
--    owner_id) ...` referenced a column that didn't exist.
--
-- 2) `team_members.role` has a CHECK constraint that only allowed
--    ('admin','manager','sales') — it never included 'super_admin',
--    so registering support@evosynapse.ai also failed with the same
--    generic "Database error saving new user".
-- ============================================================

-- ---------- 1) Add the missing columns to the existing accounts table ----------
alter table public.accounts add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.accounts add column if not exists status text not null default 'active';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_status_check') then
    alter table public.accounts add constraint accounts_status_check check (status in ('active','suspended'));
  end if;
end $$;

-- ---------- 2) Allow 'super_admin' as a valid team_members.role ----------
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('admin','manager','sales','super_admin'));

-- Done. Sign-up (founding a company, or registering support@evosynapse.ai
-- as the platform super admin) should now complete successfully. 🎈
