-- ============================================================
-- MARCO — Fase 1: núcleo de diagnóstico agéntico.
-- ------------------------------------------------------------
-- MARCO no es un CRM ni un chatbot: es la capa ejecutiva que
-- diagnostica antes de prescribir y nunca actúa sin autorización
-- humana explícita. Este esquema modela exactamente eso:
--   • marco_cases      — una conversación/caso de diagnóstico.
--   • marco_messages   — el transcript de esa conversación.
--   • marco_decisions  — "problema → decisión → responsable →
--     fecha → evidencia esperada → revisión" (el formato que pide
--     la doctrina), propuesto por Marco, nunca autoejecutado.
--   • marco_actions     — el STOP gate: toda acción propuesta queda
--     en status='proposed' hasta que un humano la aprueba
--     explícitamente (approved_by). No existe motor de ejecución
--     todavía — esta tabla es memoria de intención, no de hechos.
--
-- Aislamiento: mismas políticas tenant_isolation y las mismas
-- funciones current_account_id()/is_super_admin() ya definidas en
-- 0005_multi_tenant_accounts.sql — no se duplica lógica de
-- multi-tenancy, se reutiliza tal cual.
-- ============================================================

create table if not exists public.marco_cases (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) default public.current_account_id(),
  title       text not null default 'Nuevo caso',
  status      text not null default 'open' check (status in ('open','closed')),
  created_by  uuid references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists marco_cases_account_idx on public.marco_cases (account_id, created_at desc);

create table if not exists public.marco_messages (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) default public.current_account_id(),
  case_id     uuid not null references public.marco_cases(id) on delete cascade,
  role        text not null check (role in ('user','marco')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists marco_messages_case_idx on public.marco_messages (case_id, created_at);

create table if not exists public.marco_decisions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) default public.current_account_id(),
  case_id           uuid references public.marco_cases(id) on delete cascade,
  problem           text not null,
  decision          text not null,
  owner_id          uuid references public.team_members(id) on delete set null,
  due_date          date,
  expected_evidence text,
  review_date       date,
  status            text not null default 'pending' check (status in ('pending','reviewed')),
  created_at        timestamptz not null default now()
);
create index if not exists marco_decisions_account_idx on public.marco_decisions (account_id, status);

create table if not exists public.marco_actions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) default public.current_account_id(),
  case_id       uuid references public.marco_cases(id) on delete cascade,
  decision_id   uuid references public.marco_decisions(id) on delete set null,
  action_type   text not null,
  payload       jsonb not null default '{}'::jsonb,
  reversible    boolean not null default true,
  status        text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  approved_by   uuid references public.team_members(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists marco_actions_account_idx on public.marco_actions (account_id, status);

-- ---------- RLS: mismo patrón tenant_isolation que el resto del esquema ----------
alter table public.marco_cases     enable row level security;
alter table public.marco_messages  enable row level security;
alter table public.marco_decisions enable row level security;
alter table public.marco_actions   enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['marco_cases','marco_messages','marco_decisions','marco_actions'] loop
    execute format('drop policy if exists "tenant_isolation" on public.%I;', tbl);
    execute format($f$
      create policy "tenant_isolation" on public.%I
        for all to authenticated
        using (account_id = public.current_account_id() or public.is_super_admin())
        with check (account_id = public.current_account_id() or public.is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- Done. Marco puede diagnosticar y proponer; nada se ejecuta ni se
-- aprueba solo — approved_by siempre lo escribe un humano desde la UI. 🎈
