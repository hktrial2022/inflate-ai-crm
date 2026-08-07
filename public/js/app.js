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
    { section: "main", items: [{ id: "dashboard", ico: "📊" }] },
    { section: "crm", items: [
      { id: "contacts", ico: "👤" }, { id: "companies", ico: "🏢" },
      { id: "pipeline", ico: "💼" }, { id: "inbox", ico: "💬" },
    ] },
    { section: "growth", items: [
      { id: "workflows", ico: "⚡" }, { id: "scheduling", ico: "📅" }, { id: "settings", ico: "⚙️" },
    ] },
  ];

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [route, id] = hash.split("/");
    return { route: route || "dashboard", id: id || null };
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

  function applyChrome() {
    document.documentElement.lang = window.CRM.i18n.getLang();
    window.CRM.i18n.applyStatic();
    document.getElementById("langLabel").textContent = window.CRM.i18n.getLang().toUpperCase();
    document.title = t("app.name");
    buildNav();
    buildUserChip();
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
    document.getElementById("sidebar").classList.remove("open");
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
      document.getElementById("sidebar").classList.toggle("open");
    });
    const gs = document.getElementById("globalSearch");
    gs.addEventListener("keydown", (e) => { if (e.key === "Enter") globalSearch(gs.value); });

    // storage → re-render badges when data changes
    store.onChange(() => { buildNav(); buildUserChip(); });

    window.addEventListener("hashchange", route);
    if (!location.hash) location.hash = "#/dashboard";

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

    // ---- Auth gate ----
    if (!window.CRM.auth.isLoggedIn()) {
      appEl.style.display = "none";
      window.CRM.auth.showLogin();
      return;
    }
    loginEl.style.display = "none";
    appEl.style.display = "flex";
    document.getElementById("themeToggle").textContent = (document.documentElement.getAttribute("data-theme") === "dark") ? "☀️" : "🌙";
    applyChrome();
    renderRoute();
    // Pull every collection from Supabase so the whole team sees the same
    // contacts, deals, calendars, etc. regardless of device.
    if (window.CRM.store.syncAllFromCloud) window.CRM.store.syncAllFromCloud().then(() => rerender());
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
