/* ============================================================ Companies ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h, fullName } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);
  const state = { q: "" };

  function render(root, params) {
    if (params && params.id) return renderDetail(root, params.id);
    renderList(root);
  }

  function renderList(root) {
    const store = S();
    let list = store.data.companies.slice();
    if (state.q) { const q = state.q.toLowerCase(); list = list.filter((c) => (c.name + " " + (c.industry || "") + " " + (c.website || "")).toLowerCase().includes(q)); }
    list.sort((a, b) => a.name.localeCompare(b.name));

    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("companies.title")), h("div.sub", t("companies.sub"))]),
      h("div.spacer"),
      h("button.btn.btn-primary", { onclick: () => openForm() }, ["＋ ", t("companies.newCompany")]),
    ]));

    if (!store.data.companies.length) {
      root.appendChild(ui.empty("🏢", t("companies.noCompanies"), t("companies.noCompaniesSub"),
        h("button.btn.btn-primary", { onclick: () => openForm() }, ["＋ ", t("companies.newCompany")])));
      return;
    }

    root.appendChild(h("div.toolbar", [h("div.search", [h("span.ico", "🔎"), ui.input(state.q, { type: "search", placeholder: t("common.search"), oninput: (e) => { state.q = e.target.value; window.CRM.app.rerender(); } })])]));

    if (!list.length) { root.appendChild(ui.empty("🔎", t("common.noResults"), "")); return; }

    root.appendChild(h("div.grid.grid-3", list.map((co) => companyCard(co))));
  }

  function companyCard(co) {
    const store = S();
    const contacts = store.contactsForCompany(co.id);
    const deals = store.dealsForCompany(co.id);
    const totalVal = deals.reduce((a, b) => a + (b.value || 0), 0);
    return h("div.card.card-pad", { style: { cursor: "pointer" }, onclick: () => (location.hash = "#/companies/" + co.id) }, [
      h("div.flex", { style: { gap: "12px", marginBottom: "12px" } }, [
        h("div.avatar.lg", { style: { background: ui.pastel(co.name), borderRadius: "13px" } }, ui.initials(co.name)),
        h("div", [h("h3", { style: { fontSize: "16px" } }, co.name), h("div.muted", co.industry || "—")]),
      ]),
      co.website ? h("div.faint.mb-8", { style: { fontSize: "12.5px" } }, "🌐 " + co.website) : null,
      h("div.flex.wrap", { style: { gap: "8px", marginTop: "6px" } }, [
        h("span.tag", "👥 " + t("companies.contactsCount", { n: contacts.length })),
        h("span.tag", "💼 " + t("companies.dealsCount", { n: deals.length })),
        totalVal ? h("span.tag.brand", ui.compactCurrency(totalVal)) : null,
      ]),
    ]);
  }

  function renderDetail(root, id) {
    const store = S();
    const co = store.byId("companies", id);
    if (!co) { location.hash = "#/companies"; return; }
    const contacts = store.contactsForCompany(id);
    const deals = store.dealsForCompany(id);
    const totalVal = deals.reduce((a, b) => a + (b.value || 0), 0);

    root.appendChild(h("div.view-head", [
      h("button.btn.btn-ghost", { onclick: () => (location.hash = "#/companies") }, "← " + t("common.back")),
      h("div.spacer"),
      h("button.btn", { onclick: () => openForm(co) }, "✏️ " + t("common.edit")),
      h("button.btn.btn-danger", { onclick: () => ui.confirm(t("common.deleteConfirm"), () => { store.deleteCompany(id); ui.toast(t("common.deleted"), "success"); location.hash = "#/companies"; }) }, t("common.delete")),
    ]));

    const left = h("div.card.card-pad", [
      h("div.profile-head", [h("div.avatar.lg", { style: { background: ui.pastel(co.name), borderRadius: "14px" } }, ui.initials(co.name)),
        h("div", [h("h2", { style: { fontSize: "20px" } }, co.name), h("div.muted", co.industry || "")])]),
      h("dl.kv", [
        kv(t("companies.industry"), co.industry || "—"),
        kv(t("companies.website"), co.website ? h("a.link", { href: normalizeUrl(co.website), target: "_blank" }, co.website) : "—"),
        kv(t("companies.size"), co.size ? t("sizes." + co.size) : "—"),
        kv(t("companies.people"), String(contacts.length)),
        kv(t("companies.totalValue"), ui.currency(totalVal)),
      ]),
      co.notes ? h("div.mt-16", [h("div.section-title", t("common.notes")), h("div", { style: { whiteSpace: "pre-wrap" } }, co.notes)]) : null,
    ]);

    const right = h("div", [
      h("div.card.card-pad.mb-16", [
        h("div.flex.between.mb-16", [h("h3", { style: { fontSize: "15px" } }, t("companies.associatedContacts")),
          h("button.btn.btn-sm.btn-primary", { onclick: () => window.CRM.views.contacts.openForm({ firstName: "", lastName: "", email: "", phone: "", companyId: co.id, jobTitle: "", source: "website", tags: [], notes: "", ownerId: store.data.team[0].id }) }, "＋")]),
        contacts.length ? h("div.table-wrap", { style: { boxShadow: "none", border: "none" } }, h("table.data", [
          h("thead", h("tr", [h("th", t("common.name")), h("th", t("contacts.jobTitle")), h("th", t("common.email"))])),
          h("tbody", contacts.map((c) => h("tr", { onclick: () => (location.hash = "#/contacts/" + c.id) }, [
            h("td", h("div.person-cell", [ui.avatar(fullName(c), "sm"), fullName(c)])), h("td", c.jobTitle || "—"), h("td.faint", c.email || "—"),
          ]))),
        ])) : h("p.faint", t("companies.noPeople")),
      ]),
      h("div.card.card-pad", [
        h("div.flex.between.mb-16", [h("h3", { style: { fontSize: "15px" } }, t("companies.dealHistory")),
          h("button.btn.btn-sm.btn-primary", { onclick: () => window.CRM.views.pipeline.openDealForm(null, { companyId: co.id }) }, "＋")]),
        deals.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, deals.map((d) =>
          h("div.flex.between", { style: { padding: "10px", background: "var(--bg-sunken)", borderRadius: "9px" } }, [
            h("div", [h("span", { style: { fontWeight: 600 } }, d.title || "—"), h("div", ui.stagePill(d.stage))]),
            h("span", { style: { fontWeight: 700 } }, ui.currency(d.value)),
          ]))) : h("p.faint", t("companies.noDeals")),
      ]),
    ]);

    root.appendChild(h("div.detail-grid", [left, right]));
  }

  function openForm(existing) {
    const store = S();
    const co = existing ? Object.assign({}, existing) : { name: "", industry: "", website: "", size: "m", notes: "" };
    const m = ui.modal({ title: existing ? t("companies.editCompany") : t("companies.newCompany"), icon: "🏢" });
    m.setBody(h("div.form-grid", [
      ui.field(t("companies.title").replace(/s$/, "") + " *", ui.input(co.name, { oninput: (e) => (co.name = e.target.value) }), { full: true }),
      ui.field(t("companies.industry"), ui.input(co.industry, { oninput: (e) => (co.industry = e.target.value) })),
      ui.field(t("companies.size"), ui.select(Object.keys(window.CRM.i18n.DICT.en.sizes).map((k) => ({ value: k, label: t("sizes." + k) })), co.size, (v) => (co.size = v))),
      ui.field(t("companies.website"), ui.input(co.website, { oninput: (e) => (co.website = e.target.value), placeholder: "https://" }), { full: true }),
      ui.field(t("common.notes"), ui.textarea(co.notes, { oninput: (e) => (co.notes = e.target.value) }), { full: true }),
    ]));
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => {
        if (!co.name) { ui.toast(t("common.required"), "error"); return; }
        if (existing) { store.updateCompany(existing.id, co); ui.toast(t("common.saved"), "success"); }
        else { store.addCompany(co); ui.toast(t("common.created"), "success"); }
        m.close(); window.CRM.app.rerender();
      } }, t("common.save"))]);
  }

  function kv(k, v) { return [h("dt", k), h("dd", v)]; }
  function normalizeUrl(u) { return /^https?:\/\//.test(u) ? u : "https://" + u; }
  window.CRM.views.companies = { render, openForm };
})();
