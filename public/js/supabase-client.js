/* ============================================================
   Supabase client — cloud sync for Calendars + public booking.
   ------------------------------------------------------------
   Scope (intentionally focused): calendars are read/written to
   Supabase so every device sees the same booking configs, and the
   public booking widget (#/book/<slug>) writes contacts/appointments
   straight to the cloud so links work for clients on any device.
   The rest of the CRM (contacts you add by hand, deals, etc.) still
   lives in localStorage for now — see docs/DEPLOYMENT.md to expand
   this to the full app.

   The key below is the Supabase "anon/publishable" key — safe to
   ship in the browser because Row Level Security (see
   supabase/migrations/0002_calendars_and_public_booking.sql) scopes
   exactly what an anonymous visitor can read/write.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const SUPABASE_URL = "https://mrxvwllrrxbbugctkmuz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_YuUpdZiqFP-eHcYM2yo3iw_4PE4NHsB";

  if (!window.supabase) { console.warn("[supabase-client] supabase-js CDN script missing."); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---------- mappers: DB (snake_case) <-> app (camelCase) ----------
  function calToApp(r) {
    const cfg = r.config || {};
    return Object.assign({}, cfg, {
      id: r.id, slug: r.slug, name: r.name, description: r.description, type: r.type,
      memberIds: r.member_ids || [], durationValue: r.duration_value, durationUnit: r.duration_unit,
      seatsPerClass: r.seats_per_class, location: r.location, locationCustom: r.location_custom,
      businessHours: r.business_hours || {}, createdAt: r.created_at,
    });
  }
  function calToDb(c) {
    const known = ["id", "slug", "name", "description", "type", "memberIds", "durationValue", "durationUnit", "seatsPerClass", "location", "locationCustom", "businessHours", "createdAt"];
    const config = {};
    Object.keys(c || {}).forEach((k) => { if (known.indexOf(k) === -1) config[k] = c[k]; });
    return {
      slug: c.slug, name: c.name, description: c.description || "", type: c.type,
      member_ids: c.memberIds || [], duration_value: c.durationValue || 30, duration_unit: c.durationUnit || "minutes",
      seats_per_class: c.seatsPerClass || 1, location: c.location || "custom", location_custom: c.locationCustom || "",
      business_hours: c.businessHours || {}, config: config,
    };
  }

  // ---------- Calendars: cloud CRUD ----------
  async function fetchCalendars() {
    const { data, error } = await sb.from("calendars").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(calToApp);
  }
  async function fetchCalendarBySlug(slug) {
    const { data, error } = await sb.from("calendars").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;
    return data ? calToApp(data) : null;
  }
  async function upsertCalendar(c) {
    const row = Object.assign({ id: c.id && c.id.length === 36 ? c.id : undefined }, calToDb(c));
    const { data, error } = await sb.from("calendars").upsert(row, { onConflict: "id" }).select().single();
    if (error) throw error;
    return calToApp(data);
  }
  async function deleteCalendarRemote(id) {
    const { error } = await sb.from("calendars").delete().eq("id", id);
    if (error) throw error;
  }

  // ---------- Team (read-only for anon; used to show host names) ----------
  async function fetchTeam() {
    const { data, error } = await sb.from("team_members").select("*");
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, color: r.color }));
  }

  // ---------- Public booking writes ----------
  async function findContactByEmail(email) {
    const { data, error } = await sb.from("contacts").select("*").ilike("email", email).maybeSingle();
    if (error && error.code !== "PGRST116") throw error; // ignore "no rows" variants
    return data || null;
  }
  async function insertContact(c) {
    const { data, error } = await sb.from("contacts").insert({
      first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone,
      source: c.source || "website", tags: c.tags || [], notes: c.notes || "",
    }).select().single();
    if (error) throw error;
    return data;
  }
  async function insertAppointment(a) {
    const { error } = await sb.from("appointments").insert({
      contact_id: a.contactId, owner_id: a.ownerId, type: a.type, start_at: a.startAt, duration_min: a.durationMin,
    });
    if (error) throw error;
  }
  async function insertActivity(a) {
    const { error } = await sb.from("activities").insert({ contact_id: a.contactId, type: a.type, title: a.title, due_at: a.dueAt });
    if (error) throw error;
  }

  window.CRM.cloud = {
    sb, fetchCalendars, fetchCalendarBySlug, upsertCalendar, deleteCalendarRemote,
    fetchTeam, findContactByEmail, insertContact, insertAppointment, insertActivity,
  };
  window.CRM.cloudReady = true;
})();
