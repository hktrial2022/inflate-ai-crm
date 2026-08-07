/* ============================================================
   App — router, navigation, chrome (topbar/sidebar), theme.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const store = window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  const NAV = [
    { section: "main", items: [{ id: "marco", ico: "🧭" }, { id: "dashboard", ico: "📊" }] },
    { section: "crm", items: [
      { id: "contacts", ico: "👤" }, { id: "companies", ico: "🏢" },
      { id: "pipeline", ico: "💼" }, { id: "inbox", ico: "💬" },
    ] },
    { section: "growth", items: [
      { id: "workflows", ico: "⚡" }, { id: "scheduling", ico: "📅" }, { id: "settings", ico: "⚙️" },
    ] },
  ];

  function isSuperAdmin() { const me = store.currentUser(); return !!(me && me.role === "super_admin"); }
  function inAdminMode() { return !!(window.CRM.cloud && window.CRM.cloud.getAdminAccount && window.CRM.cloud.getAdminAccount()); }

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [route, id] = hash.split("/");
    return { route: route || "dashboard", id: id || null };
  }

  // Mobile drawer: keep the sidebar and its backdrop in sync. The backdrop
  // is what makes the drawer closable — without it the open sidebar (higher
  // z-index) sits on top of the hamburger button and swallows the tap that
  // was meant to close it.
  function setSidebarOpen(open) {
    document.getElementById("sidebar").classList.toggle("open", open);
    document.getElementById("sidebarBackdrop").classList.toggle("open", open);
  }

  function setTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    localStorage.setItem("crm_theme", name);
    store.setSetting("theme", name);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = name === "dark" ? "☀️" : "🌙";
  }

  function buildNav() {
    const nav = document.getElementById("nav");
    ui.clear(nav);
    const { route } = parseHash();

    if (isSuperAdmin() && !inAdminMode()) {
      // Outside of "entering" a sub-account, a super admin only sees the admin panel —
      // never a blended view of every client's data.
      nav.appendChild(h("div.nav-section", t("nav.growth")));
      nav.appendChild(h("button.nav-item" + (route === "admin" ? ".active" : ""), { onclick: () => (location.hash = "#/admin") }, [h("span.nav-ico", "🛡️"), h("span", t("nav.admin"))]));
      return;
    }
    NAV.forEach((group) => {
      nav.appendChild(h("div.nav-section", t("nav." + group.section)));
      group.items.forEach((it) => {
        let badge = null;
        if (it.id === "pipeline") { const n = store.openDeals().length; if (n) badge = n; }
        if (it.id === "inbox") { const n = store.contactsWithMessages().length; if (n) badge = n; }
        nav.appendChild(h("button.nav-item" + (route === it.id ? ".active" : ""), { onclick: () => (location.hash = "#/" + it.id) }, [
          h("span.nav-ico", it.ico), h("span", t("nav." + it.id)),
          badge ? h("span.nav-badge", String(badge)) : null,
        ]));
      });
    });
    if (isSuperAdmin() && inAdminMode()) {
      nav.appendChild(h("div.nav-section", "—"));
      nav.appendChild(h("button.nav-item", { onclick: () => (location.hash = "#/admin") }, [h("span.nav-ico", "🛡️"), h("span", t("nav.admin"))]));
    }
  }

  function buildUserChip() {
    const chip = document.getElementById("userChip");
    const me = store.currentUser();
    ui.clear(chip);
    if (me) chip.appendChild(h("div.flex", { style: { gap: "10px", width: "100%" } }, [
      h("div.flex", { style: { gap: "10px", minWidth: 0, flex: 1, cursor: "pointer" }, onclick: () => (location.hash = "#/settings") }, [
        ui.avatar(me),
        h("div", { style: { lineHeight: 1.2, minWidth: 0 } }, [
          h("div", { style: { color: "#fff", fontWeight: 600, fontSize: "13px" } }, me.name),
          h("div", { style: { color: "var(--sidebar-fg-dim)", fontSize: "11px" } }, t("roles." + me.role)),
        ]),
      ]),
      h("button.icon-btn.logout-btn", { title: t("settings.signOut"), onclick: (e) => { e.stopPropagation(); window.CRM.auth.logout(); } }, "⏻"),
    ]));
    chip.onclick = null;
  }

  function buildAdminBanner() {
    const el = document.getElementById("adminBanner");
    ui.clear(el);
    if (!inAdminMode()) { el.style.display = "none"; return; }
    el.style.display = "flex";
    const name = (window.CRM.cloud.getAdminAccountName && window.CRM.cloud.getAdminAccountName()) || "…";
    el.className = "admin-banner";
    el.appendChild(h("span", "🛡️ " + t("admin.viewing", { name })));
    el.appendChild(h("span.link", { onclick: () => { window.CRM.cloud.clearAdminAccount(); window.CRM.store.resetTenantData(); location.hash = "#/admin"; location.reload(); } }, t("admin.exit")));
  }

  function applyChrome() {
    document.documentElement.lang = window.CRM.i18n.getLang();
    window.CRM.i18n.applyStatic();
    document.getElementById("langLabel").textContent = window.CRM.i18n.getLang().toUpperCase();
    document.title = t("app.name");
    buildNav();
    buildUserChip();
    buildAdminBanner();
  }

  let currentParams = null;
  function rerender() { renderRoute(); }

  function renderRoute() {
    const { route, id } = parseHash();
    currentParams = { id };
    const view = document.getElementById("view");
    ui.clear(view);
    document.getElementById("topbarTitle").textContent = t("nav." + route) || "";
    buildNav();

    const v = window.CRM.views[route];
    if (v && v.render) {
      try { v.render(view, { id }); }
      catch (e) { console.error(e); view.appendChild(h("div.empty", ["⚠️ ", String(e && e.message || e)])); }
    } else {
      location.hash = "#/dashboard";
    }
    // close mobile sidebar on navigate
    setSidebarOpen(false);
    document.getElementById("view").scrollTop = 0;
    window.scrollTo(0, 0);
  }

  async function init() {
    // theme (applied first so the login screen is themed too)
    const savedTheme = localStorage.getItem("crm_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    window.CRM.i18n.setLang(window.CRM.i18n.getLang());

    // one-time topbar handlers
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
      setTheme(next); rerender();
    });
    document.getElementById("langToggle").addEventListener("click", () => {
      const next = window.CRM.i18n.getLang() === "en" ? "es" : "en";
      window.CRM.i18n.setLang(next); applyChrome(); rerender();
    });
    document.getElementById("menuToggle").addEventListener("click", () => {
      setSidebarOpen(!document.getElementById("sidebar").classList.contains("open"));
    });
    document.getElementById("sidebarBackdrop").addEventListener("click", () => setSidebarOpen(false));
    const gs = document.getElementById("globalSearch");
    gs.addEventListener("keydown", (e) => { if (e.key === "Enter") globalSearch(gs.value); });

    // storage → re-render badges when data changes
    store.onChange(() => { buildNav(); buildUserChip(); });

    window.addEventListener("hashchange", route);
    // Marco es la puerta de entrada del producto — la primera pantalla que
    // ve un usuario nuevo es la conversación con Marco, no el dashboard.
    if (!location.hash) location.hash = "#/marco";

    // Public booking links never need a session — skip the resolve step so
    // they render instantly even if Supabase is slow to respond.
    const { route: r0 } = parseHash();
    if (r0 !== "book" && window.CRM.auth.resolveSession) await window.CRM.auth.resolveSession();
    route();
  }

  // Top-level dispatcher: public booking page → login gate → app
  function route() {
    const { route: r, id } = parseHash();
    const appEl = document.getElementById("app");
    const loginEl = document.getElementById("login-root");
    const pubEl = document.getElementById("public-root");

    // ---- Public, no-login booking widget: #/book/<slug> ----
    if (r === "book") {
      appEl.style.display = "none"; loginEl.style.display = "none"; pubEl.style.display = "block";
      window.CRM.views.booking.render(pubEl, { slug: id });
      return;
    }
    pubEl.style.display = "none";

    // ---- Invite link: #/join/<accountId> — always shows sign-up, even
    // if someone is currently signed in (as a different account). ----
    if (r === "join") {
      if (window.CRM.auth.isLoggedIn()) { ui.toast(t("admin.alreadySignedIn")); location.hash = "#/dashboard"; return; }
      appEl.style.display = "none";
      window.CRM.auth.showLogin({ joinAccountId: id });
      return;
    }

    // ---- Auth gate ----
    if (!window.CRM.auth.isLoggedIn()) {
      appEl.style.display = "none";
      window.CRM.auth.showLogin();
      return;
    }
    loginEl.style.display = "none";
    appEl.style.display = "flex";
    document.getElementById("themeToggle").textContent = (document.documentElement.getAttribute("data-theme") === "dark") ? "☀️" : "🌙";

    // A super admin with no sub-account "entered" only ever sees the admin
    // panel — never a blended view mixing every client's data together.
    if (isSuperAdmin() && !inAdminMode() && r !== "admin") { location.hash = "#/admin"; return; }

    applyChrome();
    renderRoute();
    // Pull every collection from Supabase so the whole team sees the same
    // contacts, deals, calendars, etc. regardless of device. Skipped on the
    // admin panel itself (r === "admin", not yet "inside" a sub-account) —
    // a super admin's RLS bypass would otherwise blend every client's rows
    // together in the local cache.
    const skipSync = isSuperAdmin() && !inAdminMode();
    if (!skipSync && window.CRM.store.syncAllFromCloud) window.CRM.store.syncAllFromCloud().then(() => rerender());
  }

  function globalSearch(q) {
    if (!q || !q.trim()) return;
    const query = q.trim().toLowerCase();
    const c = store.data.contacts.find((x) => (ui.fullName(x) + " " + x.email).toLowerCase().includes(query));
    if (c) { location.hash = "#/contacts/" + c.id; return; }
    const co = store.data.companies.find((x) => x.name.toLowerCase().includes(query));
    if (co) { location.hash = "#/companies/" + co.id; return; }
    ui.toast(t("common.noResults"), "error");
  }

  window.CRM.app = { rerender, applyChrome, setTheme, renderRoute };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
