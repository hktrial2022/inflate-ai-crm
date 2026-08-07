-- ============================================================
-- Inflate AI CRM — Supabase / PostgreSQL schema
-- ------------------------------------------------------------
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- It mirrors the local (localStorage) data model 1:1 so you can
-- migrate the app to cloud persistence with minimal changes.
--
-- Single-workspace design: every authenticated user shares the
-- same CRM data (typical for a small agency). Tighten the RLS
-- policies later if you need per-user or per-org isolation.
-- ============================================================

-- Extensions ------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  role        text not null default 'sales' check (role in ('admin','manager','sales')),
  color       text default '#6d5efc',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- PIPELINE STAGES (customizable)
-- ============================================================
create table if not exists public.stages (
  id          text primary key,               -- e.g. 'new', 'qualified'
  name_en     text not null,
  name_es     text not null,
  color       text not null default '#6d5efc',
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  position    int  not null default 0
);

-- ============================================================
-- COMPANIES
-- ============================================================
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  website     text,
  size        text default 'm' check (size in ('s','m','l','xl','xxl')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists companies_name_idx on public.companies (name);

-- ============================================================
-- CONTACTS
-- ============================================================
create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  company_id       uuid references public.companies(id) on delete set null,
  job_title        text,
  source           text default 'website',
  tags             text[] not null default '{}',
  custom_fields    jsonb  not null default '{}'::jsonb,
  notes            text,
  owner_id         uuid references public.team_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_owner_idx   on public.contacts (owner_id);
create index if not exists contacts_email_idx   on public.contacts (email);

-- ============================================================
-- DEALS
-- ============================================================
create table if not exists public.deals (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  contact_id       uuid references public.contacts(id)  on delete set null,
  company_id       uuid references public.companies(id) on delete set null,
  value            numeric not null default 0,
  probability      int not null default 20 check (probability between 0 and 100),
  stage            text references public.stages(id) on delete set null,
  owner_id         uuid references public.team_members(id) on delete set null,
  status           text not null default 'open' check (status in ('open','won','lost')),
  stage_entered_at timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists deals_stage_idx  on public.deals (stage);
create index if not exists deals_status_idx on public.deals (status);
create index if not exists deals_owner_idx  on public.deals (owner_id);

-- ============================================================
-- ACTIVITIES (calls / tasks / follow-ups / meetings)
-- ============================================================
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references public.contacts(id) on delete cascade,
  deal_id     uuid references public.deals(id)    on delete cascade,
  type        text not null default 'task' check (type in ('call','task','followup','meeting','email','note')),
  title       text not null,
  due_at      timestamptz,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists activities_contact_idx on public.activities (contact_id);

-- ============================================================
-- MESSAGES (unified conversation inbox)
-- ============================================================
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid references public.contacts(id) on delete cascade,
  channel          text not null default 'email' check (channel in ('email','sms','whatsapp','instagram','messenger','webchat','call')),
  direction        text not null default 'out' check (direction in ('in','out')),
  body             text not null,
  is_internal_note boolean not null default false,
  assigned_to      uuid references public.team_members(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists messages_contact_idx on public.messages (contact_id, created_at);

-- ============================================================
-- WORKFLOWS (automation builder)
-- ============================================================
create table if not exists public.workflows (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default false,
  trigger     text,
  steps       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- APPOINTMENTS (scheduling)
-- ============================================================
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  owner_id      uuid references public.team_members(id) on delete set null,
  type          text not null default 'Discovery Call',
  start_at      timestamptz not null,
  duration_min  int not null default 30,
  remind_sms    boolean not null default true,
  remind_email  boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists appointments_start_idx on public.appointments (start_at);

-- ============================================================
-- SEED: default pipeline stages for an AI / marketing agency
-- (Contacts, companies and deals are intentionally left EMPTY.)
-- ============================================================
insert into public.stages (id, name_en, name_es, color, is_won, is_lost, position) values
  ('new',         'New Lead',      'Lead Nuevo',        '#64748b', false, false, 0),
  ('qualified',   'Qualified',     'Calificado',        '#0ea5e9', false, false, 1),
  ('proposal',    'Proposal Sent', 'Propuesta Enviada', '#a855f7', false, false, 2),
  ('negotiation', 'Negotiation',   'Negociación',       '#f59e0b', false, false, 3),
  ('won',         'Closed Won',    'Cerrado Ganado',    '#16a34a', true,  false, 4),
  ('lost',        'Closed Lost',   'Cerrado Perdido',   '#ef4444', false, true,  5)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS and allow any authenticated (logged-in) user full
-- access. Anonymous access is blocked. Adjust to taste.
-- ============================================================
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'team_members','stages','companies','contacts','deals',
    'activities','messages','workflows','appointments'
  ] loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format($f$
      drop policy if exists "authenticated_all" on public.%I;
      create policy "authenticated_all" on public.%I
        for all to authenticated using (true) with check (true);
    $f$, tbl, tbl);
  end loop;
end $$;

-- Done. Your CRM schema is ready. 🎈
