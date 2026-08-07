# 🔐 Authentication — Inflate AI CRM

The app uses **real Supabase Auth** for login/sign-up (email + password, with Google/Apple ready to enable). Every team member's data — contacts, deals, calendars, etc. — is shared across devices once they sign in.

- **Self-service sign-up** — the *"Sign up"* link on the login screen creates a real Supabase Auth account **and** a matching `team_members` profile automatically (via a DB trigger — see migration `0004`).
- **Email + password login** — signs in against Supabase Auth.
- **Google & Apple buttons** — call Supabase OAuth; they show a short setup note until you enable the provider (below).
- **Sign out** — from the sidebar (⏻) or *Settings → General*.

## ⚠️ Required one-time setting: email confirmation

By default, a fresh Supabase project **requires users to confirm their email** before they can sign in, and the free built-in email sender has a **low rate limit** (a handful of emails/hour) — fine for testing, rough for onboarding a whole team quickly.

**Recommended for an internal agency tool:** turn confirmation off.
Supabase dashboard → **Authentication → Sign In / Providers → Email** → toggle **"Confirm email"** OFF.

With it off, `Sign up` logs the person in immediately — no email round-trip. If you'd rather keep confirmation on, connect your own SMTP under **Authentication → Settings → SMTP Settings** to avoid the free-tier rate limit.

## Old local demo accounts

Earlier versions of this app used a local-only login (`you@inflate.ai` / `inflate2025`, etc.). **Those no longer work** — every teammate now needs a real account via **Sign up**. Nothing is lost: any calendars/contacts they create sync to Supabase under their real account.

---

## Enabling Google / Apple sign-in (Supabase Auth)

Social login needs a backend to handle the OAuth redirect. Supabase provides this for free. ~5–10 minutes.

### 1. Connect the Supabase client (once)
Follow [`DEPLOYMENT.md`](DEPLOYMENT.md#3-supabase) → then in `public/index.html` add before the app scripts:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
Rename `public/js/supabase-adapter.example.js` → `supabase-adapter.js`, fill in your
`SUPABASE_URL` + anon key, and load it after `store.js`. This exposes
`window.CRM.cloud.signInWithOAuth(...)`, which the login buttons call automatically.

### 2. Enable the providers in Supabase
Supabase dashboard → **Authentication → Providers**:

**Google**
1. Get an OAuth Client ID/Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials → OAuth client ID → Web application*.
2. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Paste the Client ID + Secret into Supabase's **Google** provider and toggle it on.

**Apple**
1. In the [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId) portal create a *Services ID* and a *Sign in with Apple* key.
2. Return URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Paste the Services ID, Team ID, Key ID and private key into Supabase's **Apple** provider.

### 3. Set redirect URLs
Supabase → **Authentication → URL Configuration** → add your site URL(s):
- `http://localhost:8777` (local testing)
- `https://your-app.vercel.app` (production)
- your custom domain, if any.

### 4. Done
Reload the app. The **Continue with Google / Apple** buttons now redirect through
the provider and sign the user in. Until step 2 is complete, clicking a button
shows a friendly note explaining these steps (no crash).

---

## Notes
- The **email/password sign-up** on the screen writes to the local `team` list today.
  When you move the app to Supabase (see the adapter's `signUp`/`signIn`), point
  `register()`/`login()` in `js/auth.js` at `window.CRM.cloud.*` so accounts live in
  Supabase Auth and RLS applies.
- Roles: new self-service accounts default to **Sales Rep**. Promote to Admin/Manager
  in *Settings → Team*.
