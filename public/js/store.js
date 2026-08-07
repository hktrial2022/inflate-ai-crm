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
      workflows: [], appointments: [],
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

  // ---------- Contacts ----------
  function addContact(c) {
    const rec = Object.assign({
      id: uid("c"), firstName: "", lastName: "", email: "", phone: "", companyId: null,
      jobTitle: "", source: "website", tags: [], customFields: {}, notes: "",
      ownerId: currentUserId(), createdAt: nowISO(), lastActivityAt: nowISO(),
    }, c);
    data.contacts.push(rec); emit(); return rec;
  }
  function updateContact(id, patch) { const c = byId("contacts", id); if (c) { Object.assign(c, patch); emit(); } return c; }
  function deleteContact(id) {
    data.contacts = data.contacts.filter((x) => x.id !== id);
    data.deals = data.deals.filter((d) => d.contactId !== id);
    data.activities = data.activities.filter((a) => a.contactId !== id);
    data.messages = data.messages.filter((m) => m.contactId !== id);
    emit();
  }

  // ---------- Companies ----------
  function addCompany(c) {
    const rec = Object.assign({ id: uid("co"), name: "", industry: "", website: "", size: "m", notes: "", createdAt: nowISO() }, c);
    data.companies.push(rec); emit(); return rec;
  }
  function updateCompany(id, patch) { const c = byId("companies", id); if (c) { Object.assign(c, patch); emit(); } return c; }
  function deleteCompany(id) {
    data.companies = data.companies.filter((x) => x.id !== id);
    data.contacts.forEach((c) => { if (c.companyId === id) c.companyId = null; });
    data.deals.forEach((d) => { if (d.companyId === id) d.companyId = null; });
    emit();
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
    data.deals.push(rec); emit(); return rec;
  }
  function updateDeal(id, patch) { const d = byId("deals", id); if (d) { Object.assign(d, patch); emit(); } return d; }
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
  }
  function setDealStatus(id, status) {
    const d = byId("deals", id); if (!d) return;
    d.status = status;
    if (status === "won") { const s = data.stages.find((x) => x.isWon); if (s) d.stage = s.id; d.probability = 100; }
    if (status === "lost") d.probability = 0;
    if (status === "open") d.probability = Math.max(20, d.probability || 20);
    d.stageEnteredAt = nowISO(); emit();
  }
  function deleteDeal(id) { data.deals = data.deals.filter((x) => x.id !== id); emit(); }

  // ---------- Activities ----------
  function addActivity(a) {
    const rec = Object.assign({ id: uid("a"), contactId: null, dealId: null, type: "task", title: "", dueAt: null, done: false, createdAt: nowISO() }, a);
    data.activities.push(rec);
    if (rec.contactId) { const c = byId("contacts", rec.contactId); if (c) c.lastActivityAt = nowISO(); }
    emit(); return rec;
  }
  function updateActivity(id, patch) { const a = byId("activities", id); if (a) { Object.assign(a, patch); emit(); } return a; }
  function deleteActivity(id) { data.activities = data.activities.filter((x) => x.id !== id); emit(); }
  function activitiesForContact(id) { return data.activities.filter((a) => a.contactId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
  function pendingForContact(id) { return activitiesForContact(id).filter((a) => !a.done); }

  // ---------- Messages / Conversations ----------
  function addMessage(m) {
    const rec = Object.assign({ id: uid("m"), contactId: null, channel: "email", direction: "out", body: "", isInternalNote: false, assignedTo: null, createdAt: nowISO() }, m);
    data.messages.push(rec);
    if (rec.contactId) { const c = byId("contacts", rec.contactId); if (c) c.lastActivityAt = nowISO(); }
    emit(); return rec;
  }
  function messagesForContact(id) { return data.messages.filter((m) => m.contactId === id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); }
  function contactsWithMessages() {
    const ids = [...new Set(data.messages.map((m) => m.contactId))];
    return ids.map((id) => byId("contacts", id)).filter(Boolean);
  }

  // ---------- Workflows ----------
  function addWorkflow(w) {
    const rec = Object.assign({ id: uid("w"), name: "", active: false, trigger: null, steps: [], createdAt: nowISO() }, w);
    data.workflows.push(rec); emit(); return rec;
  }
  function updateWorkflow(id, patch) { const w = byId("workflows", id); if (w) { Object.assign(w, patch); emit(); } return w; }
  function deleteWorkflow(id) { data.workflows = data.workflows.filter((x) => x.id !== id); emit(); }

  // ---------- Appointments ----------
  function addAppointment(a) {
    const rec = Object.assign({ id: uid("ap"), contactId: null, ownerId: null, type: "Discovery Call", startAt: null, durationMin: 30, remindSms: true, remindEmail: true, createdAt: nowISO() }, a);
    data.appointments.push(rec); emit(); return rec;
  }
  function deleteAppointment(id) { data.appointments = data.appointments.filter((x) => x.id !== id); emit(); }
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

  // ---------- Team ----------
  function addMember(m) {
    const colors = ["#6d5efc", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];
    const rec = Object.assign({ id: uid("u"), name: "", email: "", role: "sales", color: colors[data.team.length % colors.length] }, m);
    data.team.push(rec); emit(); return rec;
  }
  function updateMember(id, patch) { const m = byId("team", id); if (m) { Object.assign(m, patch); emit(); } return m; }
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
    addMember, updateMember, deleteMember,
    updateStages, stageName,
    setSetting, exportJSON, importJSON, resetAll,
    member, openDeals, wonDeals, lostDeals,
  };
})();
