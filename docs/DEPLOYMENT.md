# 🚀 Deployment Guide — Inflate AI CRM

Three targets, in the order you'll use them: **GitHub → Vercel → (optional) Supabase**.

---

## 1) GitHub

From the project root:

```bash
git init
git add .
git commit -m "Initial commit: Inflate AI CRM"
git branch -M main
git remote add origin https://github.com/<your-org>/inflate-ai-crm.git
git push -u origin main
```

> `.gitignore` already excludes `node_modules`, `.env`, `.vercel`, and exported backups.

---

## 2) Vercel (hosts the app)

The app is a static site living in **`public/`**. No build step is required.

**Via the dashboard (easiest):**
1. Go to [vercel.com/new](https://vercel.com/new) and **Import** your GitHub repo.
2. In the configuration screen:
   - **Framework Preset:** `Other`
   - **Root Directory:** click *Edit* → select **`public`**  ← important
   - **Build Command:** leave empty
   - **Output Directory:** leave empty
3. Click **Deploy**. You'll get a `https://inflate-ai-crm.vercel.app` URL in ~20s.

`public/vercel.json` adds clean URLs and basic security headers automatically.

**Via the CLI:**
```bash
npm i -g vercel
cd public
vercel            # preview deploy
vercel --prod     # production deploy
```

Every push to `main` re-deploys automatically once the repo is linked.

---

## 3) Supabase (optional — shared cloud database)

The app works without this (it uses your browser's local storage). Add Supabase
when you want your whole team on one database.

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query →** paste all of [`../supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. Copy your **Project URL** and **anon public key** from *Project Settings → API*.
4. Enable the cloud adapter:
   - In `public/index.html`, add before the app scripts:
     ```html
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     ```
   - Rename `public/js/supabase-adapter.example.js` → `supabase-adapter.js`,
     fill in your URL + anon key, and load it after `store.js`.
   - Migrate the calls in `store.js` to the async `window.CRM.cloud.*` methods.
5. In Vercel, add the same values as **Environment Variables**
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) under *Project → Settings → Environment Variables*, then redeploy.

See [`../supabase/README.md`](../supabase/README.md) for the CLI path and RLS details.

---

## Custom domain (e.g. crm.inflate.ai)
Vercel → your project → **Settings → Domains → Add** → point your DNS
`CNAME` to `cname.vercel-dns.com`. HTTPS is provisioned automatically.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Vercel shows a directory listing / 404 | Root Directory isn't set to `public`. |
| Styles missing when double-clicking the file | Serve over HTTP: `python -m http.server 8777 --directory public`. |
| Data "disappeared" | Local storage is **per-browser / per-device**. Use **Settings → Export** to move it, or switch to Supabase. |
| Supabase inserts rejected | Make sure you're **signed in** (RLS blocks anonymous writes). |
