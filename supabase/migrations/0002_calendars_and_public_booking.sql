-- ============================================================
-- Inflate AI CRM — Calendars + public booking access
-- ------------------------------------------------------------
-- Adds the `calendars` table (booking configs built in
-- Settings → Calendars) and opens narrow, anonymous access so
-- the public booking widget (#/book/<slug>) works for visitors
-- who are not logged in — while keeping full CRUD restricted to
-- authenticated team members.
-- ============================================================

create table if not exists public.calendars (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text,
  type              text not null default 'personal' check (type in ('personal','round_robin','class','collective')),
  -- text[] (not uuid[]): the demo/local team seeded in the browser uses
  -- ids like 'u_me' which aren't real UUIDs. Keeping this as text avoids
  -- insert failures until every team member is created via Supabase.
  member_ids        text[] not null default '{}',
  duration_value    int not null default 30,
  duration_unit     text not null default 'minutes',
  seats_per_class   int not null default 1,
  location          text default 'custom',
  location_custom   text,
  business_hours    jsonb not null default '{}'::jsonb,
  config            jsonb not null default '{}'::jsonb,  -- everything else from the 8-tab editor
  created_at        timestamptz not null default now()
);
create index if not exists calendars_slug_idx on public.calendars (slug);

alter table public.calendars enable row level security;

-- Full CRUD for the signed-in team (create/edit calendars in Settings)
drop policy if exists "authenticated_all" on public.calendars;
create policy "authenticated_all" on public.calendars
  for all to authenticated using (true) with check (true);

-- Anyone (including the public booking widget) can READ a calendar by slug
drop policy if exists "anon_read_calendars" on public.calendars;
create policy "anon_read_calendars" on public.calendars
  for select to anon using (true);

-- ============================================================
-- Narrow anonymous access for the booking flow only:
-- visitors need to (a) see who's on the team (to show host names/
-- avatars) and (b) create a contact + appointment + activity for
-- themselves. They can NOT read other people's data (no anon
-- select on contacts/appointments/activities), and they can NOT
-- update/delete anything.
-- ============================================================

drop policy if exists "anon_read_team" on public.team_members;
create policy "anon_read_team" on public.team_members
  for select to anon using (true);

drop policy if exists "anon_insert_contacts" on public.contacts;
create policy "anon_insert_contacts" on public.contacts
  for insert to anon with check (true);

drop policy if exists "anon_insert_appointments" on public.appointments;
create policy "anon_insert_appointments" on public.appointments
  for insert to anon with check (true);

drop policy if exists "anon_insert_activities" on public.activities;
create policy "anon_insert_activities" on public.activities
  for insert to anon with check (true);

drop policy if exists "anon_insert_messages" on public.messages;
create policy "anon_insert_messages" on public.messages
  for insert to anon with check (true);

-- Done. Calendars are cloud-backed and the public booking link now
-- works from any device. 🎈
