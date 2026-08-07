-- ============================================================
-- Multi-tenant accounts (agency super-admin + independent
-- sub-accounts, one per client company).
-- ------------------------------------------------------------
-- Model:
--   • accounts        — one row per client company ("sub-account").
--   • super_admins    — platform operators (support@evosynapse.ai).
--     They belong to no account and can see/enter every account.
--   • Every tenant table gets an `account_id` column. RLS makes
--     sure a signed-in user only ever sees rows from THEIR OWN
--     account, unless they're a super admin.
--
-- ⚠️ Destructive step: this migration deletes any existing rows in
-- the tenant tables below, because pre-existing rows have no
-- account to belong to and multi-tenancy can't retrofit them
-- safely. Per project decision, there is no real customer data yet
-- (only test rows from development) — nothing of value is lost.
-- ============================================================

-- ---------- 1) Accounts & super admins ----------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid references auth.users(id) on delete set null,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);
alter table public.accounts enable row level security;

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.super_admins enable row level security;

-- ---------- 2) Helper functions (used throughout RLS below) ----------
create or replace function public.is_super_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

create or replace function public.current_account_id()
returns uuid language sql security definer stable set search_path = public as $$
  select account_id from public.team_members where id = auth.uid();
$$;

-- RPC used after a Google/Apple sign-in that was started from an
-- invite link (#/join/<account>) — see js/auth.js. Only takes effect
-- once, for a brand-new user who has no account yet.
create or replace function public.join_account(target_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.team_members
  set account_id = target_account_id
  where id = auth.uid() and account_id is null
    and target_account_id in (select id from public.accounts);
end;
$$;
grant execute on function public.join_account(uuid) to authenticated;

-- ---------- 3) Clear pre-existing (non-tenant) test rows ----------
-- See the destructive-step note above.
truncate table public.messages, public.activities, public.appointments,
  public.deals, public.workflows, public.calendars, public.contacts,
  public.companies, public.stages, public.team_members cascade;

-- ---------- 4) account_id everywhere ----------
alter table public.team_members add column if not exists account_id uuid references public.accounts(id);

alter table public.companies    add column if not exists account_id uuid references public.accounts(id);
alter table public.contacts     add column if not exists account_id uuid references public.accounts(id);
alter table public.deals        add column if not exists account_id uuid references public.accounts(id);
alter table public.activities   add column if not exists account_id uuid references public.accounts(id);
alter table public.messages     add column if not exists account_id uuid references public.accounts(id);
alter table public.appointments add column if not exists account_id uuid references public.accounts(id);
alter table public.calendars    add column if not exists account_id uuid references public.accounts(id);
alter table public.workflows    add column if not exists account_id uuid references public.accounts(id);

alter table public.companies    alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.contacts     alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.deals        alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.activities   alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.messages     alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.appointments alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.calendars    alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.workflows    alter column account_id set default public.current_account_id(), alter column account_id set not null;

-- Stages become per-account (each sub-account gets its own editable
-- pipeline, seeded automatically when the account is founded — see
-- the trigger below). The primary key becomes (account_id, id).
alter table public.stages drop constraint if exists stages_pkey;
alter table public.stages add column if not exists account_id uuid references public.accounts(id);
alter table public.stages alter column account_id set default public.current_account_id(), alter column account_id set not null;
alter table public.stages add primary key (account_id, id);

-- ---------- 5) Tenant isolation policies ----------
-- Replace the old "any authenticated user sees everything" policy
-- with "only rows from your own account — unless you're a super admin".
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'companies','contacts','deals','activities','messages',
    'appointments','calendars','workflows','stages'
  ] loop
    execute format('drop policy if exists "authenticated_all" on public.%I;', tbl);
    execute format($f$
      create policy "tenant_isolation" on public.%I
        for all to authenticated
        using (account_id = public.current_account_id() or public.is_super_admin())
        with check (account_id = public.current_account_id() or public.is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- team_members: same idea, scoped by each member's own account_id.
drop policy if exists "authenticated_all" on public.team_members;
create policy "tenant_isolation_team" on public.team_members
  for all to authenticated
  using (account_id = public.current_account_id() or public.is_super_admin())
  with check (account_id = public.current_account_id() or public.is_super_admin());
-- (self_upsert_profile / self_update_profile from migration 0004 still
-- apply in addition — needed at the exact moment a new user is created.)

-- accounts: a member can see their own account; a super admin sees all.
drop policy if exists "accounts_tenant_read" on public.accounts;
create policy "accounts_tenant_read" on public.accounts
  for select to authenticated using (id = public.current_account_id() or public.is_super_admin());
drop policy if exists "accounts_super_admin_write" on public.accounts;
create policy "accounts_super_admin_write" on public.accounts
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
-- Anyone can look up an account's name (not sensitive) — powers the
-- "You're joining <Company>" message on an invite-link sign-up page.
drop policy if exists "anon_read_accounts" on public.accounts;
create policy "anon_read_accounts" on public.accounts
  for select to anon using (true);

drop policy if exists "super_admins_self_read" on public.super_admins;
create policy "super_admins_self_read" on public.super_admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- 6) Sign-up trigger: found a new account, join an existing
-- one via invite link, or recognize the platform's super admin ----------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_account_id uuid;
  v_role text := 'sales';
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  -- The one platform super admin: no tenant of their own, sees every account.
  if lower(new.email) = 'support@evosynapse.ai' then
    insert into public.team_members (id, name, email, role, account_id)
    values (new.id, v_name, new.email, 'super_admin', null)
    on conflict (id) do nothing;
    insert into public.super_admins (user_id) values (new.id) on conflict do nothing;
    return new;
  end if;

  if (new.raw_user_meta_data ->> 'join_account_id') is not null then
    -- Joining an existing sub-account via an invite link.
    v_account_id := (new.raw_user_meta_data ->> 'join_account_id')::uuid;
    v_role := 'sales';
  else
    -- Founding a brand-new, independent sub-account.
    insert into public.accounts (name, owner_id)
    values (coalesce(new.raw_user_meta_data ->> 'company_name', v_name || '''s Company'), new.id)
    returning id into v_account_id;
    v_role := 'admin';

    insert into public.stages (account_id, id, name_en, name_es, color, is_won, is_lost, position) values
      (v_account_id, 'new',         'New Lead',      'Lead Nuevo',           '#64748b', false, false, 0),
      (v_account_id, 'qualified',   'Qualified',     'Calificado',           '#0ea5e9', false, false, 1),
      (v_account_id, 'proposal',    'Proposal Sent', 'Propuesta Enviada',    '#a855f7', false, false, 2),
      (v_account_id, 'negotiation', 'Negotiation',   'Negociación',          '#f59e0b', false, false, 3),
      (v_account_id, 'won',         'Closed Won',    'Cerrado Ganado',       '#16a34a', true,  false, 4),
      (v_account_id, 'lost',        'Closed Lost',   'Cerrado Perdido',      '#ef4444', false, true,  5);
  end if;

  insert into public.team_members (id, name, email, role, account_id)
  values (new.id, v_name, new.email, v_role, v_account_id)
  on conflict (id) do nothing;
  return new;
end;
$$;
-- (trigger itself was already created in migration 0004 and points at
-- this function by name, so it picks up this new version automatically)

-- ---------- 7) Anonymous booking inserts must carry a real account ----------
-- The public booking widget (#/book/<slug>) has no signed-in user, so
-- it can't rely on current_account_id(). js/views/booking.js now looks
-- up the calendar's own account_id and passes it explicitly on the
-- contact/appointment/activity/message it creates. Guard that it's
-- always a real account (never spoofable to null).
drop policy if exists "anon_insert_contacts" on public.contacts;
create policy "anon_insert_contacts" on public.contacts
  for insert to anon with check (account_id is not null);
drop policy if exists "anon_insert_appointments" on public.appointments;
create policy "anon_insert_appointments" on public.appointments
  for insert to anon with check (account_id is not null);
drop policy if exists "anon_insert_activities" on public.activities;
create policy "anon_insert_activities" on public.activities
  for insert to anon with check (account_id is not null);
drop policy if exists "anon_insert_messages" on public.messages;
create policy "anon_insert_messages" on public.messages
  for insert to anon with check (account_id is not null);

-- Done. Every sub-account is now fully isolated; support@evosynapse.ai
-- is the one account that can see and enter all of them. 🎈
