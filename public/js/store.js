/* ============================================================
   Store — local data layer (localStorage).
   The single source of truth. Swap this module for a Supabase
   client to go cloud (see docs/DEPLOYMENT.md). Emits 'change'.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const KEY = "inflate_crm_data_v1";

  // ---- Default stage config for an AI / marketing agency ----
  const DEFAULT_STAGES = [
    { id: "new",        name: { en: "New Lead",      es: "Lead Nuevo" },     color: "#64748b", isWon: false, isLost: false },
    { id: "qualified",  name: { en: "Qualified",     es: "Calificado" },     color: "#0ea5e9", isWon: false, isLost: false },
    { id: "proposal",   name: { en: "Proposal Sent", es: "Propuesta Enviada" }, color: "#a855f7", isWon: false, isLost: false },
    { id: "negotiation",name: { en: "Negotiation",   es: "Negociación" },    color: "#f59e0b", isWon: false, isLost: false },
    { id: "won",        name: { en: "Closed Won",    es: "Cerrado Ganado" }, color: "#16a34a", isWon: true,  isLost: false },
  ];

  // Team members are needed so deals/contacts can be assigned.
  // These are editable in Settings; contacts/companies/deals stay EMPTY.
  // NOTE: passwords are stored client-side for a local access gate — this is a
  // presentation-level login, not production security. For real auth, connect
  // Supabase Auth (see public/js/supabase-adapter.example.js).
  const DEFAULT_PASSWORD = "inflate2025";
  const DEFAULT_TEAM = [
    { id: "u_me",  name: "You",          email: "you@inflate.ai",   role: "admin", color: "#6d5efc", password: DEFAULT_PASSWORD },
    { id: "u_ana", name: "Ana Ruiz",     email: "ana@inflate.ai",   role: "sales", color: "#0ea5e9", password: DEFAULT_PASSWORD },
    { id: "u_leo", name: "Leo Martins",  email: "leo@inflate.ai",   role: "sales", color: "#16a34a", password: DEFAULT_PASSWORD },
  ];

  function emptyData() {
    return {
      contacts: [], companies: [], deals: [], activities: [], messages: [],
      workflows: [], appointments: [], calendars: [],
      team: DEFAULT_TEAM.map((x) => ({ ...x })),
      stages: DEFAULT_STAGES.map((s) => ({ ...s, name: { ...s.name } })),
      settings: { currency: "USD", theme: localStorage.getItem("crm_theme") || "light" },
      seq: 1,
    };
  }

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyData();
      const parsed = JSON.parse(raw);
      // merge to be resilient to older shapes
      return Object.assign(emptyData(), parsed);
    } catch (e) {
      console.warn("Failed to load data, starting fresh", e);
      return emptyData();
    }
  }

  const listeners = new Set();
  function persist() { localStorage.setItem(KEY, JSON.stringify(data)); }
  function emit() { persist(); listeners.forEach((fn) => fn()); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function uid(prefix) { return (prefix || "id") + "_" + (data.seq++).toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowISO() { return new Date().toISOString(); }

  // Currently signed-in team member (set by auth.js via localStorage 'crm_session').
  function currentUser() {
    const id = localStorage.getItem("crm_session");
    return byId("team", id) || data.team[0] || null;
  }
  function currentUserId() { const u = currentUser(); return u ? u.id : null; }

  // ---------- Generic collection helpers ----------
  function all(coll) { return data[coll].slice(); }
  function byId(coll, id) { return data[coll].find((x) => x.id === id); }

  // ============================================================
  // Cloud sync — every collection below follows the same pattern:
  // save locally first (instant UI), then push to Supabase in the
  // background. New records adopt the server-issued UUID (via
  // remapId, cascading to anything that referenced the old local
  // id) so later edits target the right cloud row. Never blocks or
  // breaks the UI if Supabase is unreachable — see cloudSync().
  // ============================================================
  function cloudSync(fn) {
    if (!(window.CRM.cloud && window.CRM.cloudReady)) return;
    Promise.resolve().then(fn).catch((e) => console.warn("[cloud sync]", e.message || e));
  }
  function isCloudId(id) { return window.CRM.cloud && window.CRM.cloud.isUuid(id); }

  const REF_MAP = {
    contacts: [["deals", "contactId"], ["activities", "contactId"], ["messages", "contactId"], ["appointments", "contactId"]],
    companies: [["contacts", "companyId"], ["deals", "companyId"]],
  };
  function remapId(collection, oldId, newId) {
    if (!newId || oldId === newId) return;
    const rec = byId(collection, oldId); if (!rec) return;
    rec.id = newId;
    (REF_MAP[collection] || []).forEach(([coll, field]) => { data[coll].forEach((r) => { if (r[field] === oldId) r[field] = newId; }); });
    persist();
  }
  function cloudCreate(collection, api, rec) {
    cloudSync(async () => { const saved = await api.insert(rec); if (saved) remapId(collection, rec.id, saved.id); });
  }
  function cloudUpdate(collection, api, id, patch) {
    cloudSync(async () => {
      const current = byId(collection, id); if (!current) return;
      if (isCloudId(id)) await api.update(id, patch);
      else { const saved = await api.insert(current); if (saved) remapId(collection, id, saved.id); }
    });
  }
  function cloudDelete(collection, api, id) { cloudSync(() => (isCloudId(id) ? api.remove(id) : Promise.resolve())); }

  // Wipe the locally-cached tenant collections (contacts, deals, etc.).
  // Called whenever a super admin enters or exits a sub-account, so leftover
  // rows from a previously-viewed company never bleed into the next one.
  function resetTenantData() {
    ["contacts", "companies", "deals", "activities", "messages", "appointments", "calendars", "workflows", "stages"].forEach((c) => { data[c] = []; });
    // Keep only the caller's own profile in `team` (super admins aren't part
    // of any account) so the next sync repopulates just the viewed company's
    // roster, instead of accumulating members from every account ever entered.
    const myId = localStorage.getItem("crm_session");
    data.team = data.team.filter((m) => m.id === myId);
    persist();
  }

  // Pull every collection from Supabase and merge into the local cache
  // (upsert by id) — called once after login so the whole team shares
  // the same contacts, deals, calendars, etc. across every device.
  async function syncAllFromCloud() {
    if (!(window.CRM.cloud && window.CRM.cloudReady)) return;
    const c = window.CRM.cloud;
    const jobs = [
      ["team", c.fetchTeam()], ["companies", c.companies.fetchAll()], ["contacts", c.contacts.fetchAll()],
      ["deals", c.deals.fetchAll()], ["activities", c.activities.fetchAll()], ["messages", c.messages.fetchAll()],
      ["appointments", c.appointments.fetchAll()], ["workflows", c.workflows.fetchAll()], ["calendars", c.calendars.fetchAll()],
    ];
    const results = await Promise.allSettled(jobs.map((j) => j[1]));
    results.forEach((res, i) => {
      const [coll] = jobs[i];
      if (res.status !== "fulfilled") { console.warn("[cloud sync] pull failed:", coll, res.reason && res.reason.message); return; }
      res.value.forEach((remote) => {
        const idx = data[coll].findIndex((x) => x.id === remote.id || (coll === "calendars" && x.slug === remote.slug));
        if (idx >= 0) data[coll][idx] = Object.assign({}, data[coll][idx], remote);
        else data[coll].push(remote);
      });
    });
    // stages use a text id and rarely change — merge by id, keep local color/name if newer edits pending
    try {
      const remoteStages = await c.stages.fetchAll();
      if (remoteStages.length) data.stages = remoteStages;
    } catch (e) { /* non-fatal */ }
    persist();
  }

  // ---------- Contacts ----------
  function addContact(c) {
    const rec = Object.assign({
      id: uid("c"), firstName: "", lastName: "", email: "", phone: "", companyId: null,
      jobTitle: "", source: "website", tags: [], customFields: {}, notes: "",
      ownerId: currentUserId(), createdAt: nowISO(), lastActivityAt: nowISO(),
    }, c);
    data.contacts.push(rec); emit();
    cloudCreate("contacts", window.CRM.cloud && window.CRM.cloud.contacts, rec);
    return rec;
  }
  function updateContact(id, patch) {
    const c = byId("contacts", id); if (c) { Object.assign(c, patch); emit(); cloudUpdate("contacts", window.CRM.cloud && window.CRM.cloud.contacts, id, c); }
    return c;
  }
  function deleteContact(id) {
    data.contacts = data.contacts.filter((x) => x.id !== id);
    data.deals = data.deals.filter((d) => d.contactId !== id);
    data.activities = data.activities.filter((a) => a.contactId !== id);
    data.messages = data.messages.filter((m) => m.contactId !== id);
    emit();
    cloudDelete("contacts", window.CRM.cloud && window.CRM.cloud.contacts, id);
  }

  // ---------- Companies ----------
  function addCompany(c) {
    const rec = Object.assign({ id: uid("co"), name: "", industry: "", website: "", size: "m", notes: "", createdAt: nowISO() }, c);
    data.companies.push(rec); emit();
    cloudCreate("companies", window.CRM.cloud && window.CRM.cloud.companies, rec);
    return rec;
  }
  function updateCompany(id, patch) {
    const c = byId("companies", id); if (c) { Object.assign(c, patch); emit(); cloudUpdate("companies", window.CRM.cloud && window.CRM.cloud.companies, id, c); }
    return c;
  }
  function deleteCompany(id) {
    data.companies = data.companies.filter((x) => x.id !== id);
    data.contacts.forEach((c) => { if (c.companyId === id) c.companyId = null; });
    data.deals.forEach((d) => { if (d.companyId === id) d.companyId = null; });
    emit();
    cloudDelete("companies", window.CRM.cloud && window.CRM.cloud.companies, id);
  }
  function contactsForCompany(id) { return data.contacts.filter((c) => c.companyId === id); }
  function dealsForCompany(id) { return data.deals.filter((d) => d.companyId === id); }

  // ---------- Deals ----------
  function firstOpenStage() { const s = data.stages.find((x) => !x.isWon && !x.isLost); return s ? s.id : (data.stages[0] && data.stages[0].id); }
  function addDeal(d) {
    const rec = Object.assign({
      id: uid("d"), title: "", contactId: null, companyId: null, value: 0, probability: 20,
      stage: firstOpenStage(), ownerId: currentUserId(),
      status: "open", stageEnteredAt: nowISO(), createdAt: nowISO(),
    }, d);
    data.deals.push(rec); emit();
    cloudCreate("deals", window.CRM.cloud && window.CRM.cloud.deals, rec);
    return rec;
  }
  function updateDeal(id, patch) {
    const d = byId("deals", id); if (d) { Object.assign(d, patch); emit(); cloudUpdate("deals", window.CRM.cloud && window.CRM.cloud.deals, id, d); }
    return d;
  }
  function moveDeal(id, stageId) {
    const d = byId("deals", id); if (!d) return;
    d.stage = stageId; d.stageEnteredAt = nowISO();
    const st = data.stages.find((s) => s.id === stageId);
    if (st && st.isWon) { d.status = "won"; d.probability = 100; }
    else if (st && st.isLost) { d.status = "lost"; d.probability = 0; }
    else d.status = "open";
    // touch contact activity
    if (d.contactId) { const c = byId("contacts", d.contactId); if (c) c.lastActivityAt = nowISO(); }
    emit();
    cloudUpdate("deals", window.CRM.cloud && window.CRM.cloud.deals, id, d);
  }
  function setDealStatus(id, status) {
    const d = byId("deals", id); if (!d) return;
    d.status = status;
    if (status === "won") { const s = data.stages.find((x) => x.isWon); if (s) d.stage = s.id; d.probability = 100; }
    if (status === "lost") d.probability = 0;
    if (status === "open") d.probability = Math.max(20, d.probability || 20);
    d.stageEnteredAt = nowISO(); emit();
    cloudUpdate("deals", window.CRM.cloud && window.CRM.cloud.deals, id, d);
  }
  function deleteDeal(id) { data.deals = data.deals.filter((x) => x.id !== id); emit(); cloudDelete("deals", window.CRM.cloud && window.CRM.cloud.deals, id); }

  // ---------- Activities ----------
  function addActivity(a) {
    const rec = Object.assign({ id: uid("a"), contactId: null, dealId: null, type: "task", title: "", dueAt: null, done: false, createdAt: nowISO() }, a);
    data.activities.push(rec);
    if (rec.contactId) { const c = byId("contacts", rec.contactId); if (c) c.lastActivityAt = nowISO(); }
    emit();
    cloudCreate("activities", window.CRM.cloud && window.CRM.cloud.activities, rec);
    return rec;
  }
  function updateActivity(id, patch) {
    const a = byId("activities", id); if (a) { Object.assign(a, patch); emit(); cloudUpdate("activities", window.CRM.cloud && window.CRM.cloud.activities, id, a); }
    return a;
  }
  function deleteActivity(id) { data.activities = data.activities.filter((x) => x.id !== id); emit(); cloudDelete("activities", window.CRM.cloud && window.CRM.cloud.activities, id); }
  function activitiesForContact(id) { return data.activities.filter((a) => a.contactId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
  function pendingForContact(id) { return activitiesForContact(id).filter((a) => !a.done); }

  // ---------- Messages / Conversations ----------
  function addMessage(m) {
    const rec = Object.assign({ id: uid("m"), contactId: null, channel: "email", direction: "out", body: "", isInternalNote: false, assignedTo: null, createdAt: nowISO() }, m);
    data.messages.push(rec);
    if (rec.contactId) { const c = byId("contacts", rec.contactId); if (c) c.lastActivityAt = nowISO(); }
    emit();
    cloudCreate("messages", window.CRM.cloud && window.CRM.cloud.messages, rec);
    return rec;
  }
  function messagesForContact(id) { return data.messages.filter((m) => m.contactId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); }
  function contactsWithMessages() {
    const ids = [...new Set(data.messages.map((m) => m.contactId))];
    return ids.map((id) => byId("contacts", id)).filter(Boolean);
  }

  // ---------- Workflows ----------
  function addWorkflow(w) {
    const rec = Object.assign({ id: uid("w"), name: "", active: false, trigger: null, steps: [], createdAt: nowISO() }, w);
    data.workflows.push(rec); emit();
    cloudCreate("workflows", window.CRM.cloud && window.CRM.cloud.workflows, rec);
    return rec;
  }
  function updateWorkflow(id, patch) {
    const w = byId("workflows", id); if (w) { Object.assign(w, patch); emit(); cloudUpdate("workflows", window.CRM.cloud && window.CRM.cloud.workflows, id, w); }
    return w;
  }
  function deleteWorkflow(id) { data.workflows = data.workflows.filter((x) => x.id !== id); emit(); cloudDelete("workflows", window.CRM.cloud && window.CRM.cloud.workflows, id); }

  // ---------- Appointments ----------
  function addAppointment(a) {
    const rec = Object.assign({ id: uid("ap"), contactId: null, ownerId: null, type: "Discovery Call", startAt: null, durationMin: 30, remindSms: true, remindEmail: true, createdAt: nowISO() }, a);
    data.appointments.push(rec); emit();
    cloudCreate("appointments", window.CRM.cloud && window.CRM.cloud.appointments, rec);
    return rec;
  }
  function deleteAppointment(id) { data.appointments = data.appointments.filter((x) => x.id !== id); emit(); cloudDelete("appointments", window.CRM.cloud && window.CRM.cloud.appointments, id); }
  // round-robin owner selection
  function nextRoundRobinOwner() {
    const reps = data.team.filter((m) => m.role === "sales" || m.role === "admin");
    if (!reps.length) return null;
    const counts = {};
    reps.forEach((r) => (counts[r.id] = 0));
    data.appointments.forEach((a) => { if (counts[a.ownerId] != null) counts[a.ownerId]++; });
    let best = reps[0];
    reps.forEach((r) => { if (counts[r.id] < counts[best.id]) best = r; });
    return best.id;
  }

  // ---------- Calendars (booking) ----------
  function defaultBusinessHours() {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const bh = {};
    days.forEach((d) => { bh[d] = { enabled: d !== "sat" && d !== "sun", from: "09:00", to: "17:00" }; });
    return bh;
  }
  function slugify(s) { return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function uniqueSlug(base, ignoreId) {
    let slug = slugify(base) || "calendar";
    let n = 1, candidate = slug;
    while (data.calendars.some((c) => c.slug === candidate && c.id !== ignoreId)) { n++; candidate = slug + "-" + n; }
    return candidate;
  }
  function addCalendar(c) {
    const rec = Object.assign({
      id: uid("cal"), name: "", description: "", type: "personal",
      memberIds: [], slug: "", durationValue: 30, durationUnit: "minutes",
      seatsPerClass: 1, location: "custom", locationCustom: "", businessHours: defaultBusinessHours(), createdAt: nowISO(),
      // basic details
      logo: "", group: "", inviteTitle: "{{contact.name}}", color: "#178af6",
      // availability
      recurring: false, timezone: "America/Mexico_City",
      // booking rules
      intervalValue: 30, intervalUnit: "minutes",
      minNoticeValue: 1, minNoticeUnit: "days",
      dateRangeValue: 30, dateRangeUnit: "days",
      preBufferValue: 0, preBufferUnit: "minutes", postBufferValue: 0, postBufferUnit: "minutes",
      maxPerDay: null, maxPerSlot: 1, lookBusy: false, lookBusyPct: 0,
      // form & confirmation
      formPreset: "default", widgetOrder: ["datetime", "form"], stickyContacts: false,
      consent: true, consentText: "", addGuests: false,
      confirmType: "default", redirectUrl: "", thankYouMsg: "", metaPixel: "", autoConfirm: true,
      // payments
      acceptPayments: false, paymentAmount: 0,
      // notifications & policies
      statusLabels: true, assignContacts: true, skipAssign: false,
      allowReschedule: true, rescheduleExpireValue: 0, rescheduleExpireUnit: "minutes",
      allowCancel: true, cancelExpireValue: 0, cancelExpireUnit: "minutes",
      allowThirdParty: true, inviteNotes: "",
      // widget appearance
      coverImage: "", widgetStyle: "neo", primaryColor: "#178af6", backgroundColor: "#ffffff",
      buttonText: "", showTitle: true, showDescription: true, showDetails: true, customCode: "",
    }, c);
    rec.slug = uniqueSlug(rec.slug || rec.name, rec.id);
    data.calendars.push(rec); emit(); return rec;
  }
  function updateCalendar(id, patch) {
    const c = byId("calendars", id); if (!c) return null;
    Object.assign(c, patch);
    if (patch.slug != null) c.slug = uniqueSlug(patch.slug || c.name, id);
    emit(); return c;
  }
  function deleteCalendar(id) { data.calendars = data.calendars.filter((x) => x.id !== id); emit(); }

  // Cloud-aware wrappers used by the Settings/editor UI. They save
  // locally immediately (instant UI) and push to Supabase in the
  // background so the calendar + its public link work from any device.
  function saveCalendarToCloud(cal) {
    cloudSync(async () => {
      const saved = await window.CRM.cloud.upsertCalendar(cal);
      // adopt the server-issued UUID as our local id so future edits update (not duplicate) the row
      if (saved && saved.id && saved.id !== cal.id) {
        const local = byId("calendars", cal.id);
        if (local) { local.id = saved.id; persist(); }
      }
    });
  }
  function deleteCalendarFromCloud(cal) { cloudSync(() => window.CRM.cloud.deleteCalendarRemote(cal.id)); }

  // Pull calendars + team from Supabase into the local cache (called on
  // app boot) so every signed-in teammate sees the same calendar list.
  async function syncCalendarsFromCloud() {
    if (!(window.CRM.cloud && window.CRM.cloudReady)) return;
    try {
      const [remoteCals, remoteTeam] = await Promise.all([window.CRM.cloud.fetchCalendars(), window.CRM.cloud.fetchTeam()]);
      remoteCals.forEach((rc) => {
        const idx = data.calendars.findIndex((c) => c.id === rc.id || c.slug === rc.slug);
        if (idx >= 0) data.calendars[idx] = Object.assign({}, data.calendars[idx], rc);
        else data.calendars.push(rc);
      });
      // merge remote team members we don't know locally (so host avatars/names resolve)
      remoteTeam.forEach((rt) => { if (!data.team.find((m) => m.id === rt.id)) data.team.push(rt); });
      emit();
    } catch (e) { console.warn("[cloud sync] calendars/team pull failed", e.message || e); }
  }

  // ---------- Team ----------
  function addMember(m) {
    const colors = ["#6d5efc", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];
    const rec = Object.assign({ id: uid("u"), name: "", email: "", role: "sales", color: colors[data.team.length % colors.length] }, m);
    data.team.push(rec); emit(); return rec;
  }
  function updateMember(id, patch) {
    const m = byId("team", id); if (m) { Object.assign(m, patch); emit(); cloudSync(() => window.CRM.cloud.updateTeamMember(id, patch)); }
    return m;
  }
  function deleteMember(id) { if (data.team.length <= 1) return; data.team = data.team.filter((x) => x.id !== id); emit(); }

  // ---------- Stages ----------
  function updateStages(stages) { data.stages = stages; emit(); }
  function stageName(stageId) {
    const s = data.stages.find((x) => x.id === stageId);
    if (!s) return stageId;
    const lang = window.CRM.i18n.getLang();
    return s.name[lang] || s.name.en || s.id;
  }

  // ---------- Settings / data ----------
  function setSetting(k, v) { data.settings[k] = v; emit(); }
  function exportJSON() { return JSON.stringify(data, null, 2); }
  function importJSON(json) {
    try { const parsed = JSON.parse(json); data = Object.assign(emptyData(), parsed); emit(); return true; }
    catch (e) { return false; }
  }
  function resetAll() {
    const keepTeam = data.team, keepStages = data.stages, keepSettings = data.settings;
    data = emptyData();
    data.team = keepTeam; data.stages = keepStages; data.settings = keepSettings;
    emit();
  }

  // ---------- Analytics helpers ----------
  function member(id) { return byId("team", id); }
  function openDeals() { return data.deals.filter((d) => d.status === "open"); }
  function wonDeals() { return data.deals.filter((d) => d.status === "won"); }
  function lostDeals() { return data.deals.filter((d) => d.status === "lost"); }

  window.CRM.store = {
    onChange, uid, nowISO, currentUser, currentUserId,
    get data() { return data; },
    all, byId,
    addContact, updateContact, deleteContact,
    addCompany, updateCompany, deleteCompany, contactsForCompany, dealsForCompany,
    addDeal, updateDeal, moveDeal, setDealStatus, deleteDeal, firstOpenStage,
    addActivity, updateActivity, deleteActivity, activitiesForContact, pendingForContact,
    addMessage, messagesForContact, contactsWithMessages,
    addWorkflow, updateWorkflow, deleteWorkflow,
    addAppointment, deleteAppointment, nextRoundRobinOwner,
    addCalendar, updateCalendar, deleteCalendar, slugify, defaultBusinessHours,
    saveCalendarToCloud, deleteCalendarFromCloud, syncCalendarsFromCloud, syncAllFromCloud, resetTenantData,
    addMember, updateMember, deleteMember,
    updateStages, stageName,
    setSetting, exportJSON, importJSON, resetAll,
    member, openDeals, wonDeals, lostDeals,
  };
})();
