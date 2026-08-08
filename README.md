# 🧭 Marco

An AI COO that diagnoses your business and turns decisions into action — backed by a lean, powerful, **bilingual (English / Español)** CRM.
It runs **100% locally** with **zero build step and zero dependencies** — just open it in a browser — and ships ready to deploy to **GitHub → Vercel** with an optional **Supabase** backend.

> The database starts **completely empty** — no dummy contacts, companies or deals. Add your real leads and watch the analytics come to life.

---

## ✨ Features

**Core CRM**
- **📊 Executive Dashboard** — pipeline value, win rate, avg. time-to-close, conversion funnel, pipeline-by-stage, lead sources (donut), weekly new-lead trend, won-vs-lost, performance by owner.
- **👤 Contacts** — full profiles (name, email, phone, company, job title, source, tags, **custom fields**, notes, owner, created/last-activity), pending activities, interaction history, search / filter / sort, tag & field segmentation.
- **🏢 Companies** — org records separate from people; each shows industry, website, size, all associated contacts, deal history and total value.
- **💼 Pipeline** — visual **drag-and-drop** Kanban with 5 agency-tuned stages (New Lead → Qualified → Proposal Sent → Negotiation → Closed Won) plus **Closed Lost**. Cards show contact, company, value, probability, days-in-stage & owner. Fully **customizable stages** in Settings.
- **💬 Unified Inbox** — one threaded conversation per contact across **Email, SMS, WhatsApp, Instagram DM, Messenger, Web Chat** (Email/SMS functional; others laid out & ready). Internal notes, conversation assignment, quick-reply templates.

**Growth (stretch modules — included)**
- **⚡ Workflow Automation** — visual node-based builder with triggers (form submitted, tag added, appointment booked, payment received, deal stage changed), actions (email/SMS, wait, assign task, move stage, notify team), if/else conditions, and starter templates (nurture, onboarding, deal recovery).
- **📅 Scheduling** — booking page with a live calendar, **round-robin** assignment, Google/Outlook sync placeholders, and SMS/email reminder settings.

**Access**
- 🔐 **Login & sign-up** — branded bilingual login screen with email/password, self-service registration, and **Google / Apple** buttons (activated by connecting Supabase Auth — see [docs/AUTH.md](docs/AUTH.md)). Sign out from the sidebar. Default demo password: `inflate2025`.

**Everywhere**
- 🌐 **Bilingual** — instant EN ⇄ ES toggle on the login screen, in Settings *and* the top bar; every label, empty-state and date is localized.
- 🌙 **Light / Dark** themes. 💱 Multi-currency (USD / MXN / EUR).
- 💾 Local-first storage + **JSON export/import** for backup or migration.

---

## 🚀 Quick start (100% local)

**Option A — just open it.** Double-click `public/index.html`. Done.
*(Some browsers restrict a few features on `file://`; if anything looks off, use Option B.)*

**Option B — tiny local server (recommended):**

```bash
# Python (bundled on most machines)
python -m http.server 8777 --directory public
# → open http://localhost:8777

# …or Node, if you have it
npx serve public
```

There is **no build, no install, no framework**. It's plain HTML/CSS/JS.

---

## 📁 Repository layout — what goes where

```
inflate-ai-crm/
├── public/            → 🟢 THE APP (this is what Vercel serves)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/            (i18n, store, ui, charts, app + views/)
│   └── vercel.json    (static config: clean URLs + security headers)
│
├── supabase/          → 🟣 SUPABASE (run this in your project)
│   ├── schema.sql               (full schema + RLS + default stages)
│   ├── migrations/0001_init.sql (same, as a migration)
│   └── config.toml              (Supabase CLI config)
│
├── docs/DEPLOYMENT.md → step-by-step GitHub + Vercel + Supabase guide
├── package.json       → optional dev-server scripts
├── .env.example       → Supabase keys template (only for cloud mode)
└── .gitignore
```

| Target | Folder / file | What to do |
|---|---|---|
| **GitHub** | the whole repo | `git init && git push` (see DEPLOYMENT.md) |
| **Vercel** | `public/` | Import the repo, set **Root Directory = `public`** → deploy |
| **Supabase** | `supabase/schema.sql` | Paste into the SQL Editor and run |

Full walkthrough: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## ☁️ Local vs. Cloud

The app is **local-first**: all data lives in your browser's `localStorage`, so it works offline and needs no server. This is perfect for a single user or a quick demo.

To share one database across your team, migrate to Supabase:
1. Run `supabase/schema.sql`.
2. Follow the drop-in adapter in [`public/js/supabase-adapter.example.js`](public/js/supabase-adapter.example.js).

Your local data can be moved over anytime via **Settings → Export data (JSON)**.

---

## 🛠️ Tech

Vanilla JavaScript (ES5-safe classic scripts), a hand-built CSS design system, and inline-SVG charts. No React, no bundler, no `node_modules` required to run. Chosen deliberately so the app is dependency-free, fast, and trivially deployable.

🧭
