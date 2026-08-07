/* ============================================================
   Supabase client — full cloud backend for Inflate AI CRM.
   ------------------------------------------------------------
   Real Supabase Auth (email/password + Google/Apple) plus cloud
   sync for every collection: contacts, companies, deals,
   activities, messages, appointments, calendars, workflows,
   stages, team members.

   Architecture: the app keeps its existing synchronous,
   localStorage-backed store (js/store.js) as an instant local
   cache — every view keeps working unchanged. On top of that,
   every add/update/delete also pushes to Supabase in the
   background (best-effort, never blocks the UI), and on login the
   app pulls everything down and merges it into the local cache —
   that's what makes data shared across your whole team and every
   device.

   The key below is the Supabase "anon/publishable" key — safe to
   ship in the browser: real writes require a signed-in Supabase
   Auth session (RLS policies require the `authenticated` role),
   except for the public booking widget's narrowly-scoped anon
   policies (see migrations 0002/0003).
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const SUPABASE_URL = "https://mrxvwllrrxbbugctkmuz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_YuUpdZiqFP-eHcYM2yo3iw_4PE4NHsB";

  if (!window.supabase) { console.warn("[supabase-client] supabase-js CDN script missing."); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");
  const uuidOrNull = (v) => (isUuid(v) ? v : null);

  // ============================================================
  // AUTH
  // ============================================================
  async function signIn(email, password) { return sb.auth.signInWithPassword({ email, password }); }
  async function signUp(email, password, name) { return sb.auth.signUp({ email, password, options: { data: { name: name || "" } } }); }
  async function signOut() { return sb.auth.signOut(); }
  async function getSession() { const { data } = await sb.auth.getSession(); return data.session; }
  async function signInWithOAuth(provider) { return sb.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } }); }
  async function fetchProfile(userId) {
    const { data, error } = await sb.from("team_members").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, name: data.name, email: data.email, role: data.role, color: data.color } : null;
  }
  async function ensureProfile(userId, name, email) {
    const existing = await fetchProfile(userId);
    if (existing) return existing;
    const { data, error } = await sb.from("team_members").upsert({ id: userId, name: name || email, email, role: "sales" }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, email: data.email, role: data.role, color: data.color };
  }

  // ============================================================
  // Generic table sync factory — cuts repetition across the 8
  // collections below. `toApp`/`toDb` convert snake_case <-> camelCase.
  // ============================================================
  function makeSync(table, toApp, toDb) {
    return {
      async fetchAll() {
        const { data, error } = await sb.from(table).select("*");
        if (error) throw error;
        return (data || []).map(toApp);
      },
      async insert(rec) {
        const { data, error } = await sb.from(table).insert(toDb(rec)).select().single();
        if (error) throw error;
        return toApp(data);
      },
      async update(id, patch) {
        const { data, error } = await sb.from(table).update(toDb(patch)).eq("id", id).select().single();
        if (error) throw error;
        return toApp(data);
      },
      async upsert(rec) {
        const row = Object.assign({}, toDb(rec), isUuid(rec.id) ? { id: rec.id } : {});
        const { data, error } = await sb.from(table).upsert(row).select().single();
        if (error) throw error;
        return toApp(data);
      },
      async remove(id) { const { error } = await sb.from(table).delete().eq("id", id); if (error) throw error; },
    };
  }

  const companies = makeSync("companies",
    (r) => ({ id: r.id, name: r.name, industry: r.industry, website: r.website, size: r.size, notes: r.notes, createdAt: r.created_at }),
    (c) => ({ name: c.name, industry: c.industry || "", website: c.website || "", size: c.size || "m", notes: c.notes || "" }));

  const contacts = makeSync("contacts",
    (r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, companyId: r.company_id, jobTitle: r.job_title, source: r.source, tags: r.tags || [], customFields: r.custom_fields || {}, notes: r.notes, ownerId: r.owner_id, createdAt: r.created_at, lastActivityAt: r.last_activity_at }),
    (c) => ({ first_name: c.firstName || "", last_name: c.lastName || "", email: c.email || "", phone: c.phone || "", company_id: uuidOrNull(c.companyId), job_title: c.jobTitle || "", source: c.source || "website", tags: c.tags || [], custom_fields: c.customFields || {}, notes: c.notes || "", owner_id: uuidOrNull(c.ownerId), last_activity_at: c.lastActivityAt || new Date().toISOString() }));

  const deals = makeSync("deals",
    (r) => ({ id: r.id, title: r.title, contactId: r.contact_id, companyId: r.company_id, value: Number(r.value), probability: r.probability, stage: r.stage, ownerId: r.owner_id, status: r.status, stageEnteredAt: r.stage_entered_at, createdAt: r.created_at }),
    (d) => ({ title: d.title || "", contact_id: uuidOrNull(d.contactId), company_id: uuidOrNull(d.companyId), value: d.value || 0, probability: d.probability || 0, stage: d.stage, owner_id: uuidOrNull(d.ownerId), status: d.status || "open", stage_entered_at: d.stageEnteredAt || new Date().toISOString() }));

  const activities = makeSync("activities",
    (r) => ({ id: r.id, contactId: r.contact_id, dealId: r.deal_id, type: r.type, title: r.title, dueAt: r.due_at, done: r.done, createdAt: r.created_at }),
    (a) => ({ contact_id: uuidOrNull(a.contactId), deal_id: uuidOrNull(a.dealId), type: a.type || "task", title: a.title || "", due_at: a.dueAt, done: !!a.done }));

  const messages = makeSync("messages",
    (r) => ({ id: r.id, contactId: r.contact_id, channel: r.channel, direction: r.direction, body: r.body, isInternalNote: r.is_internal_note, assignedTo: r.assigned_to, createdAt: r.created_at }),
    (m) => ({ contact_id: uuidOrNull(m.contactId), channel: m.channel || "email", direction: m.direction || "out", body: m.body || "", is_internal_note: !!m.isInternalNote, assigned_to: uuidOrNull(m.assignedTo) }));

  const appointments = makeSync("appointments",
    (r) => ({ id: r.id, contactId: r.contact_id, ownerId: r.owner_id, type: r.type, startAt: r.start_at, durationMin: r.duration_min, remindSms: r.remind_sms, remindEmail: r.remind_email, createdAt: r.created_at }),
    (a) => ({ contact_id: uuidOrNull(a.contactId), owner_id: uuidOrNull(a.ownerId), type: a.type || "Discovery Call", start_at: a.startAt, duration_min: a.durationMin || 30, remind_sms: a.remindSms !== false, remind_email: a.remindEmail !== false }));

  const workflows = makeSync("workflows",
    (r) => ({ id: r.id, name: r.name, active: r.active, trigger: r.trigger, steps: r.steps || [], createdAt: r.created_at }),
    (w) => ({ name: w.name || "", active: !!w.active, trigger: w.trigger || null, steps: w.steps || [] }));

  // Calendars: keep the richer mapping (unknown fields fold into `config` jsonb)
  function calToApp(r) {
    const cfg = r.config || {};
    return Object.assign({}, cfg, { id: r.id, slug: r.slug, name: r.name, description: r.description, type: r.type, memberIds: r.member_ids || [], durationValue: r.duration_value, durationUnit: r.duration_unit, seatsPerClass: r.seats_per_class, location: r.location, locationCustom: r.location_custom, businessHours: r.business_hours || {}, createdAt: r.created_at });
  }
  function calToDb(c) {
    const known = ["id", "slug", "name", "description", "type", "memberIds", "durationValue", "durationUnit", "seatsPerClass", "location", "locationCustom", "businessHours", "createdAt"];
    const config = {}; Object.keys(c || {}).forEach((k) => { if (known.indexOf(k) === -1) config[k] = c[k]; });
    return { slug: c.slug, name: c.name, description: c.description || "", type: c.type, member_ids: (c.memberIds || []).map(String), duration_value: c.durationValue || 30, duration_unit: c.durationUnit || "minutes", seats_per_class: c.seatsPerClass || 1, location: c.location || "custom", location_custom: c.locationCustom || "", business_hours: c.businessHours || {}, config };
  }
  const calendars = {
    fetchAll: async () => { const { data, error } = await sb.from("calendars").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data || []).map(calToApp); },
    fetchBySlug: async (slug) => { const { data, error } = await sb.from("calendars").select("*").eq("slug", slug).maybeSingle(); if (error) throw error; return data ? calToApp(data) : null; },
    upsert: async (c) => { const row = Object.assign({}, calToDb(c), isUuid(c.id) ? { id: c.id } : {}); const { data, error } = await sb.from("calendars").upsert(row, { onConflict: "id" }).select().single(); if (error) throw error; return calToApp(data); },
    remove: async (id) => { const { error } = await sb.from("calendars").delete().eq("id", id); if (error) throw error; },
  };

  const stages = {
    fetchAll: async () => {
      const { data, error } = await sb.from("stages").select("*").order("position");
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, name: { en: r.name_en, es: r.name_es }, color: r.color, isWon: r.is_won, isLost: r.is_lost }));
    },
    upsert: async (s, position) => {
      const { error } = await sb.from("stages").upsert({ id: s.id, name_en: s.name.en, name_es: s.name.es, color: s.color, is_won: !!s.isWon, is_lost: !!s.isLost, position: position || 0 });
      if (error) throw error;
    },
  };

  async function fetchTeam() {
    const { data, error } = await sb.from("team_members").select("*");
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, color: r.color }));
  }
  async function updateTeamMember(id, patch) {
    if (!isUuid(id)) return null; // local-only members (no real Supabase Auth account yet) can't be updated in the cloud
    const row = {};
    ["name", "email", "role", "color"].forEach((k) => { if (patch[k] !== undefined) row[k] = patch[k]; });
    const { data, error } = await sb.from("team_members").update(row).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  window.CRM.cloud = {
    sb, signIn, signUp, signOut, getSession, signInWithOAuth, fetchProfile, ensureProfile,
    companies, contacts, deals, activities, messages, appointments, workflows, calendars, stages,
    fetchTeam, updateTeamMember, isUuid, uuidOrNull,
    // legacy names kept for booking.js compatibility
    fetchCalendars: calendars.fetchAll, fetchCalendarBySlug: calendars.fetchBySlug,
    upsertCalendar: calendars.upsert, deleteCalendarRemote: calendars.remove,
    findContactByEmail: async (email) => { const { data, error } = await sb.from("contacts").select("*").ilike("email", email).maybeSingle(); if (error && error.code !== "PGRST116") throw error; return data || null; },
    insertContact: (c) => contacts.insert(c),
    insertAppointment: (a) => appointments.insert(a),
    insertActivity: (a) => activities.insert(a),
  };
  window.CRM.cloudReady = true;
})();
