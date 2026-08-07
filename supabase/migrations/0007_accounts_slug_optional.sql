-- ============================================================
-- Fix: the pre-existing `accounts` table (a leftover demo table
-- from before this project used it for multi-tenancy) requires a
-- non-null `slug` column that the app's sign-up trigger never
-- fills in — every founding sign-up failed with:
--   "null value in column slug of relation accounts violates
--    not-null constraint"
-- The app doesn't use `slug` at all, so simply make it optional.
-- ============================================================

alter table public.accounts alter column slug drop not null;

-- Done. Sign-up should now complete without a database error. 🎈
