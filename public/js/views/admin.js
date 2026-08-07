/* ============================================================ Agency Admin Panel — list every sub-account, enter one for support ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const t = (k, v) => window.CRM.i18n.t("admin." + k, v);

  function render(root) {
    const cloud = window.CRM.cloud;
    if (!cloud || !window.CRM.cloudReady) {
      root.appendChild(ui.empty("🛡️", t("title"), "Connect Supabase to manage sub-accounts."));
      return;
    }

    root.appendChild(h("div.view-head", [h("div", [h("h1", t("title")), h("div.sub", t("sub"))])]));

    const body = h("div", h("p.faint", "Loading…"));
    root.appendChild(body);

    Promise.all([cloud.accounts.listAll()]).then(([accounts]) => {
      ui.clear(body);
      if (!accounts.length) { body.appendChild(ui.empty("🏢", t("noAccounts"), t("noAccountsSub"))); return; }

      body.appendChild(h("div.grid.grid-3.mb-16", [
        stat(t("totalAccounts"), String(accounts.length)),
        stat(t("totalUsers"), "…", "usersStat"),
        stat(t("totalContacts"), "…", "contactsStat"),
      ]));

      const table = h("div.table-wrap", h("table.data", [
        h("thead", h("tr", [h("th", t("company")), h("th", t("created")), h("th", t("members")), h("th", t("contacts")), h("th", t("status")), h("th", "")])),
        h("tbody", accounts.map((a) => row(a))),
      ]));
      body.appendChild(table);

      // fill in member/contact counts async per-row + totals
      let totalUsers = 0, totalContacts = 0;
      accounts.forEach((a) => {
        Promise.all([cloud.accounts.memberCount(a.id), cloud.accounts.contactCount(a.id)]).then(([mc, cc]) => {
          totalUsers += mc; totalContacts += cc;
          const mEl = document.getElementById("mc_" + a.id); if (mEl) mEl.textContent = mc;
          const cEl = document.getElementById("cc_" + a.id); if (cEl) cEl.textContent = cc;
          const us = document.getElementById("usersStat"); if (us) us.textContent = String(totalUsers);
          const cs = document.getElementById("contactsStat"); if (cs) cs.textContent = String(totalContacts);
        }).catch(() => {});
      });
    }).catch((e) => { ui.clear(body); body.appendChild(h("p", "⚠️ " + (e.message || e))); });
  }

  function stat(label, value, id) {
    return h("div.stat", [h("div.stat-label", label), h("div.stat-value", { id }, value)]);
  }

  function row(a) {
    const cloud = window.CRM.cloud;
    return h("tr", [
      h("td", [h("strong", a.name), h("div.faint", { style: { fontSize: "11.5px" } }, a.id)]),
      h("td", ui.fmtDate(a.created_at)),
      h("td", { id: "mc_" + a.id }, "…"),
      h("td", { id: "cc_" + a.id }, "…"),
      h("td", h("span.pill." + (a.status === "active" ? "green" : "red"), a.status === "active" ? t("active") : t("suspended"))),
      h("td.right", h("div.flex", { style: { gap: "6px", justifyContent: "flex-end" } }, [
        h("button.btn.btn-sm.btn-primary", { onclick: () => enter(a) }, "👁️ " + t("enter")),
        h("button.btn.btn-sm.btn-ghost", { onclick: () => toggleStatus(a) }, a.status === "active" ? "⏸️ " + t("suspend") : "▶️ " + t("reactivate")),
      ])),
    ]);
  }

  function enter(a) {
    ui.confirm(t("enterConfirm", { name: a.name }), () => {
      window.CRM.cloud.setAdminAccount(a.id, a.name);
      window.CRM.store.resetTenantData();
      location.hash = "#/dashboard";
      location.reload();
    }, { danger: false, yes: "👁️ " + t("enter"), title: t("enter") });
  }

  function toggleStatus(a) {
    const next = a.status === "active" ? "suspended" : "active";
    const go = () => window.CRM.cloud.accounts.setStatus(a.id, next).then(() => window.CRM.app.rerender()).catch((e) => ui.toast(e.message, "error"));
    if (next === "suspended") ui.confirm(t("suspendConfirm", { name: a.name }), go, { yes: t("suspend") });
    else go();
  }

  window.CRM.views.admin = { render };
})();
