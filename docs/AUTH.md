# 🔐 Authentication — Inflate AI CRM

The app ships with a **built-in login & sign-up screen** that works immediately:

- **Email + password login** — team members sign in with their email. Default password: `inflate2025` (change per member in *Settings → Team → 🔑 Password*).
- **Self-service sign-up** — the *"Sign up"* link creates a new team member account and signs them in.
- **Google & Apple buttons** — present on the screen, activated by connecting Supabase Auth (below).
- **Sign out** — from the sidebar (⏻) or *Settings → General*.

> ⚠️ The built-in gate stores the session in the browser (`localStorage`). It's great for internal/agency use and demos, but it is **client-side** — it doesn't stop a determined user with devtools. For real security and for **working Google/Apple sign-in**, connect **Supabase Auth** as below.

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
