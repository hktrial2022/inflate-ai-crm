/* ============================================================
   OPTIONAL: Supabase cloud adapter (EXAMPLE — not loaded by default)
   ------------------------------------------------------------
   The app ships 100% local (js/store.js uses localStorage). When
   you're ready to sync to the cloud, this file shows the shape of
   a drop-in replacement so multiple teammates share one database.

   HOW TO ENABLE
   1. Run supabase/schema.sql in your Supabase project.
   2. In public/index.html, BEFORE the other scripts, add:
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   3. Rename this file to `supabase-adapter.js`, fill in the keys
      below, and load it right after store.js in index.html.
   4. Migrate the read/write helpers in store.js to `await` the
      async versions here (localStorage is synchronous; Supabase
      is async, so views that call store.addContact() etc. would
      need to handle promises / re-render on completion).

   This example intentionally keeps the surface small: it shows
   auth + one full CRUD resource (contacts). Repeat the pattern
   for companies, deals, activities, messages, workflows,
   appointments and team_members.
   ============================================================ */
(function () {
  const SUPABASE_URL = "https://YOUR-PROJECT-ref.supabase.co";
  const SUPABASE_ANON_KEY = "your-anon-public-key";

  if (!window.supabase) {
    console.warn("[supabase-adapter] supabase-js not found. Add the CDN <script> first.");
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // snake_case (DB) <-> camelCase (app) mappers -------------
  const toApp = (r) => ({
    id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email,
    phone: r.phone, companyId: r.company_id, jobTitle: r.job_title, source: r.source,
    tags: r.tags || [], customFields: r.custom_fields || {}, notes: r.notes,
    ownerId: r.owner_id, createdAt: r.created_at, lastActivityAt: r.last_activity_at,
  });
  const toDb = (c) => ({
    first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone,
    company_id: c.companyId || null, job_title: c.jobTitle, source: c.source,
    tags: c.tags || [], custom_fields: c.customFields || {}, notes: c.notes,
    owner_id: c.ownerId || null,
  });

  const cloud = {
    auth: sb.auth,
    async signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); },
    async signOut() { return sb.auth.signOut(); },

    // CONTACTS (template — replicate for other resources)
    async listContacts() {
      const { data, error } = await sb.from("contacts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(toApp);
    },
    async addContact(c) {
      const { data, error } = await sb.from("contacts").insert(toDb(c)).select().single();
      if (error) throw error;
      return toApp(data);
    },
    async updateContact(id, patch) {
      const { data, error } = await sb.from("contacts").update(toDb(patch)).eq("id", id).select().single();
      if (error) throw error;
      return toApp(data);
    },
    async deleteContact(id) {
      const { error } = await sb.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },

    // Realtime example: react to changes from other teammates
    subscribeContacts(onChange) {
      return sb.channel("contacts-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, onChange)
        .subscribe();
    },
  };

  window.CRM = window.CRM || {};
  window.CRM.cloud = cloud;
  console.info("[supabase-adapter] Cloud adapter ready (example). Wire it into store.js to activate.");
})();
