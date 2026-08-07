# 🟣 Supabase — Inflate AI CRM

This folder contains everything to stand up the cloud database for the CRM.
**The app runs fine without Supabase** (it defaults to local storage). Use this
only when you want a shared, multi-user database.

## Contents
| File | Purpose |
|---|---|
| `schema.sql` | Full schema: tables, indexes, RLS policies, and the 6 default pipeline stages. Idempotent — safe to re-run. |
| `migrations/0001_init.sql` | The same schema packaged as a CLI migration. |
| `config.toml` | Supabase CLI project config. |

> Contacts, companies and deals are **not** seeded — only the pipeline stages are, so the board has columns. Your CRM starts empty by design.

## Option A — Dashboard (no CLI, fastest)
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**.
3. Paste the entire contents of [`schema.sql`](schema.sql) and click **Run**.
4. Grab your keys from **Project Settings → API** (`Project URL` + `anon public` key).
5. Wire them into the app via [`../public/js/supabase-adapter.example.js`](../public/js/supabase-adapter.example.js).

## Option B — Supabase CLI
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF   # edit config.toml first
supabase db push                                # applies migrations/
```

## Security notes
- **Row Level Security is ON** for every table. The included policy grants full
  access to any **authenticated** user and blocks anonymous access — a sensible
  default for a small agency where everyone shares the CRM.
- The `anon` key is safe to ship in the browser **because** RLS is enabled.
- Need per-user or per-client isolation? Add an `owner`/`org_id` column and
  tighten the `using (...)` / `with check (...)` clauses in `schema.sql`.
