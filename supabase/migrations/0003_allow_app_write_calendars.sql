-- ============================================================
-- Fix: allow the CRM app itself to write calendars.
-- ------------------------------------------------------------
-- Inflate AI CRM's login screen is an APP-LEVEL gate (its own
-- localStorage session) — it does not call Supabase Auth. That
-- means every request from the browser, including from a signed-in
-- team member, reaches Supabase as the "anon" role, not
-- "authenticated". The previous migration only granted calendar
-- writes to "authenticated", so the app itself couldn't save
-- calendars (only read them) — this migration fixes that.
--
-- Tradeoff (documented on purpose): anyone with the anon key could
-- also write to `calendars` directly via the API, bypassing the
-- app's login screen. For an internal agency tool this is an
-- acceptable, common tradeoff — but for stronger security later,
-- migrate the login screen to real Supabase Auth (see docs/AUTH.md)
-- and swap this policy back to `authenticated`-only.
-- ============================================================

drop policy if exists "anon_write_calendars" on public.calendars;
create policy "anon_write_calendars" on public.calendars
  for all to anon using (true) with check (true);

-- Done. The app can now create/edit/delete calendars again. 🎈
