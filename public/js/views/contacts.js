/* ============================================================ Contacts ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h, fullName } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  const state = { q: "", source: "", owner: "", tag: "", sortKey: "createdAt", sortDir: "desc" };

  function render(root, params) {
    if (params && params.id) return renderDetail(root, params.id);
    renderList(root);
  }

  // ---------------- LIST ----------------
  function renderList(root) {
    const store = S();
    let list = store.data.contacts.slice();

    // filters
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((c) => (fullName(c) + " " + c.email + " " + c.phone + " " + (c.jobTitle || "")).toLowerCase().includes(q) ||
        (companyName(c.companyId) || "").toLowerCase().includes(q));
    }
    if (state.source) list = list.filter((c) => c.source === state.source);
    if (state.owner) list = list.filter((c) => c.ownerId === state.owner);
    if (state.tag) list = list.filter((c) => (c.tags || []).includes(state.tag));

    // sort
    list.sort((a, b) => {
      let av, bv;
      if (state.sortKey === "name") { av = fullName(a).toLowerCase(); bv = fullName(b).toLowerCase(); }
      else { av = a[state.sortKey]; bv = b[state.sortKey]; }
      if (av < bv) return state.sortDir === "asc" ? -1 : 1;
      if (av > bv) return state.sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const allTags = [...new Set(store.data.contacts.flatMap((c) => c.tags || []))];

    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("contacts.title")), h("div.sub", t("contacts.sub"))]),
      h("div.spacer"),
      h("button.btn.btn-primary", { onclick: () => openForm() }, ["＋ ", t("contacts.newContact")]),
    ]));

    // toolbar
    const toolbar = h("div.toolbar", [
      h("div.search", [h("span.ico", "🔎"), ui.input(state.q, { type: "search", placeholder: t("common.search"), oninput: (e) => { state.q = e.target.value; refresh(); } })]),
      ui.select([{ value: "", label: t("contacts.allSources") }].concat(Object.keys(window.CRM.i18n.DICT.en.sources).map((k) => ({ value: k, label: t("sources." + k) }))), state.source, (v) => { state.source = v; refresh(); }, { style: "width:auto" }),
      ui.select([{ value: "", label: t("contacts.allOwners") }].concat(store.data.team.map((m) => ({ value: m.id, label: m.name }))), state.owner, (v) => { state.owner = v; refresh(); }, { style: "width:auto" }),
      allTags.length ? ui.select([{ value: "", label: t("contacts.allTags") }].concat(allTags.map((tg) => ({ value: tg, label: tg }))), state.tag, (v) => { state.tag = v; refresh(); }, { style: "width:auto" }) : null,
    ]);
    root.appendChild(toolbar);

    if (!store.data.contacts.length) {
      root.appendChild(ui.empty("👤", t("contacts.noContacts"), t("contacts.noContactsSub"),
        h("button.btn.btn-primary", { onclick: () => openForm() }, ["＋ ", t("contacts.newContact")])));
      return;
    }
    if (!list.length) { root.appendChild(ui.empty("🔎", t("common.noResults"), "")); return; }

    const th = (label, key) => h("th", { onclick: key ? () => { toggleSort(key); refresh(); } : null },
      [label, key && state.sortKey === key ? h("span.sort-arrow", state.sortDir === "asc" ? "▲" : "▼") : null]);

    const table = h("div.table-wrap", h("table.data", [
      h("thead", h("tr", [
        th(t("common.name"), "name"), th(t("common.company")), th(t("contacts.jobTitle"), "jobTitle"),
        th(t("common.source"), "source"), th(t("common.tags")), th(t("common.owner")),
        th(t("contacts.lastActivity"), "lastActivityAt"), th(""),
      ])),
      h("tbody", list.map((c) => contactRow(c))),
    ]));
    root.appendChild(table);

    function refresh() { const scroll = window.scrollY; window.CRM.app.rerender(); window.scrollTo(0, scroll); }
  }

  function contactRow(c) {
    const pending = S().pendingForContact(c.id).length;
    return h("tr", { onclick: () => (location.hash = "#/contacts/" + c.id) }, [
      h("td", h("div.person-cell", [ui.avatar(fullName(c)), h("div.meta", [
        h("span", { style: { fontWeight: 600 } }, [fullName(c), pending ? h("span.pill.amber", { style: { marginLeft: "8px" } }, "● " + pending) : null]),
        h("small", c.email || "—"),
      ])])),
      h("td", companyName(c.companyId) ? h("span.link", companyName(c.companyId)) : h("span.faint", "—")),
      h("td", c.jobTitle || h("span.faint", "—")),
      h("td", c.source ? h("span.tag", t("sources." + c.source) || c.source) : "—"),
      h("td", ui.tagList(c.tags)),
      h("td", ui.ownerCell(c.ownerId)),
      h("td", h("span.faint", ui.relTime(c.lastActivityAt))),
      h("td.right", h("button.btn.btn-sm.btn-ghost", { onclick: (e) => { e.stopPropagation(); openForm(c); } }, "✏️")),
    ]);
  }

  // ---------------- DETAIL ----------------
  function renderDetail(root, id) {
    const store = S();
    const c = store.byId("contacts", id);
    if (!c) { location.hash = "#/contacts"; return; }
    const company = c.companyId ? store.byId("companies", c.companyId) : null;

    root.appendChild(h("div.view-head", [
      h("button.btn.btn-ghost", { onclick: () => (location.hash = "#/contacts") }, "← " + t("common.back")),
      h("div.spacer"),
      h("button.btn", { onclick: () => openForm(c) }, "✏️ " + t("common.edit")),
      h("button.btn.btn-danger", { onclick: () => ui.confirm(t("common.deleteConfirm"), () => { store.deleteContact(id); ui.toast(t("common.deleted"), "success"); location.hash = "#/contacts"; }) }, t("common.delete")),
    ]));

    const left = h("div", [
      h("div.card.card-pad", [
        h("div.profile-head", [ui.avatar(fullName(c), "lg"), h("div", [
          h("h2", { style: { fontSize: "20px" } }, fullName(c)),
          h("div.muted", c.jobTitle || ""),
          company ? h("span.link", { onclick: () => (location.hash = "#/companies/" + company.id) }, "🏢 " + company.name) : null,
        ])]),
        h("dl.kv", [
          kv(t("common.email"), c.email ? h("a.link", { href: "mailto:" + c.email }, c.email) : "—"),
          kv(t("common.phone"), c.phone || "—"),
          kv(t("common.source"), c.source ? t("sources." + c.source) : "—"),
          kv(t("common.owner"), ui.ownerCell(c.ownerId)),
          kv(t("common.tags"), ui.tagList(c.tags)),
          kv(t("contacts.created"), ui.fmtDate(c.createdAt)),
          kv(t("contacts.lastActivity"), ui.relTime(c.lastActivityAt)),
        ]),
        c.notes ? h("div.mt-16", [h("div.section-title", t("common.notes")), h("div", { style: { whiteSpace: "pre-wrap" } }, c.notes)]) : null,
        customFieldsBlock(c),
      ]),
    ]);

    const right = h("div", [
      pendingBlock(c),
      dealsBlock(c),
      historyBlock(c),
    ]);

    root.appendChild(h("div.detail-grid", [left, right]));
  }

  function customFieldsBlock(c) {
    const keys = Object.keys(c.customFields || {});
    return h("div.mt-16", [
      h("div.flex.between.mb-8", [h("div.section-title", { style: { margin: 0 } }, t("contacts.customFields")),
        h("button.btn.btn-sm.btn-ghost", { onclick: () => addCustomField(c) }, "＋")]),
      keys.length ? h("dl.kv", keys.map((k) => kv(k, String(c.customFields[k])))) : h("span.faint", "—"),
    ]);
  }
  function addCustomField(c) {
    let name = "", value = "";
    const m = ui.modal({ title: t("contacts.addCustomField"), icon: "＋" });
    m.setBody(h("div.form-grid", [
      ui.field(t("contacts.fieldName"), ui.input("", { oninput: (e) => (name = e.target.value) }), { full: true }),
      ui.field(t("contacts.fieldValue"), ui.input("", { oninput: (e) => (value = e.target.value) }), { full: true }),
    ]));
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => { if (name) { c.customFields = c.customFields || {}; c.customFields[name] = value; S().updateContact(c.id, { customFields: c.customFields }); } m.close(); window.CRM.app.rerender(); } }, t("common.save"))]);
  }

  function pendingBlock(c) {
    const store = S();
    const pending = store.pendingForContact(c.id);
    const done = store.activitiesForContact(c.id).filter((a) => a.done);
    return h("div.card.card-pad.mb-16", [
      h("div.flex.between.mb-16", [h("h3", { style: { fontSize: "15px" } }, t("contacts.pendingActivities")),
        h("button.btn.btn-sm.btn-primary", { onclick: () => addActivity(c) }, "＋ " + t("contacts.addActivity"))]),
      pending.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, pending.map((a) => activityRow(a, c))) : h("p.faint", t("contacts.noPending")),
      done.length ? h("details.mt-16", [h("summary.muted", { style: { cursor: "pointer" } }, "✓ " + done.length), h("div.mt-8", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, done.map((a) => activityRow(a, c)))]) : null,
    ]);
  }
  function activityRow(a, c) {
    return h("div.flex.between", { style: { padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "9px" } }, [
      h("label.flex", { style: { gap: "9px", cursor: "pointer" } }, [
        h("input", { type: "checkbox", checked: a.done, onchange: (e) => { S().updateActivity(a.id, { done: e.target.checked }); window.CRM.app.rerender(); } }),
        h("div", [h("span", { style: { fontWeight: 600, textDecoration: a.done ? "line-through" : "none", opacity: a.done ? .6 : 1 } }, a.title),
          h("div.faint", { style: { fontSize: "12px" } }, [h("span.tag", { style: { marginRight: "6px" } }, t("activity." + a.type)), a.dueAt ? "📅 " + ui.fmtDate(a.dueAt) : ""])]),
      ]),
      h("button.btn.btn-sm.btn-ghost", { onclick: () => { S().deleteActivity(a.id); window.CRM.app.rerender(); } }, "🗑️"),
    ]);
  }
  function addActivity(c) {
    let type = "call", title = "", dueAt = "";
    const m = ui.modal({ title: t("contacts.logActivity"), icon: "✓" });
    m.setBody(h("div.form-grid", [
      ui.field(t("common.type"), ui.select(["call", "task", "followup", "meeting", "email"].map((k) => ({ value: k, label: t("activity." + k) })), type, (v) => (type = v))),
      ui.field(t("common.date"), ui.input("", { type: "date", oninput: (e) => (dueAt = e.target.value) })),
      ui.field(t("common.name"), ui.input("", { oninput: (e) => (title = e.target.value), placeholder: t("contacts.addActivity") }), { full: true }),
    ]));
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => { if (title) S().addActivity({ contactId: c.id, type, title, dueAt: dueAt ? new Date(dueAt).toISOString() : null }); m.close(); window.CRM.app.rerender(); } }, t("common.save"))]);
  }

  function dealsBlock(c) {
    const deals = S().data.deals.filter((d) => d.contactId === c.id);
    return h("div.card.card-pad.mb-16", [
      h("h3.mb-16", { style: { fontSize: "15px" } }, t("contacts.deals")),
      deals.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, deals.map((d) =>
        h("div.flex.between", { style: { padding: "10px", background: "var(--bg-sunken)", borderRadius: "9px", cursor: "pointer" }, onclick: () => (location.hash = "#/pipeline") }, [
          h("div", [h("span", { style: { fontWeight: 600 } }, d.title || "—"), h("div", ui.stagePill(d.stage))]),
          h("span", { style: { fontWeight: 700 } }, ui.currency(d.value)),
        ]))) : h("p.faint", t("companies.noDeals")),
      h("button.btn.btn-sm.mt-8", { onclick: () => window.CRM.views.pipeline.openDealForm(null, { contactId: c.id, companyId: c.companyId }) }, "＋ " + t("pipeline.newDeal")),
    ]);
  }

  function historyBlock(c) {
    const store = S();
    const acts = store.activitiesForContact(c.id).filter((a) => a.done);
    const msgs = store.messagesForContact(c.id);
    const items = [
      ...msgs.map((m) => ({ time: m.createdAt, node: msgHistoryItem(m) })),
      ...acts.map((a) => ({ time: a.createdAt, node: h("div", [h("span", { style: { fontWeight: 600 } }, "✓ " + a.title), h("span.tag", { style: { marginLeft: "8px" } }, t("activity." + a.type))]) })),
    ].sort((x, y) => new Date(y.time) - new Date(x.time));
    return h("div.card.card-pad", [
      h("div.flex.between.mb-16", [h("h3", { style: { fontSize: "15px" } }, t("contacts.interactionHistory")),
        msgs.length ? h("button.btn.btn-sm.btn-ghost", { onclick: () => (location.hash = "#/inbox/" + c.id) }, "💬 " + t("inbox.title")) : null]),
      items.length ? h("div.timeline", items.map((it) => h("div.tl-item", [h("div.tl-time", ui.fmtDateTime(it.time)), it.node]))) : h("p.faint", t("contacts.noHistory")),
    ]);
  }
  function msgHistoryItem(m) {
    const chLabel = t("channels." + m.channel);
    return h("div", [h("span.tag.brand", { style: { marginRight: "8px" } }, chLabel),
      h("span", { style: { fontWeight: m.isInternalNote ? 400 : 600, fontStyle: m.isInternalNote ? "italic" : "normal" } }, (m.direction === "out" ? "→ " : "← ") + (m.body.length > 80 ? m.body.slice(0, 80) + "…" : m.body))]);
  }

  // ---------------- FORM ----------------
  function openForm(existing) {
    const store = S();
    const c = existing ? Object.assign({}, existing, { tags: (existing.tags || []).slice() }) : {
      firstName: "", lastName: "", email: "", phone: "", companyId: "", jobTitle: "",
      source: "website", tags: [], notes: "", ownerId: store.data.team[0] ? store.data.team[0].id : "",
    };
    const m = ui.modal({ title: existing ? t("contacts.editContact") : t("contacts.newContact"), icon: "👤", wide: true });
    m.setBody(h("div.form-grid", [
      ui.field(t("contacts.firstName") + " *", ui.input(c.firstName, { oninput: (e) => (c.firstName = e.target.value) })),
      ui.field(t("contacts.lastName"), ui.input(c.lastName, { oninput: (e) => (c.lastName = e.target.value) })),
      ui.field(t("common.email"), ui.input(c.email, { type: "email", oninput: (e) => (c.email = e.target.value) })),
      ui.field(t("common.phone"), ui.input(c.phone, { oninput: (e) => (c.phone = e.target.value) })),
      ui.field(t("common.company"), ui.select(ui.companyOptions(true), c.companyId || "", (v) => (c.companyId = v || null))),
      ui.field(t("contacts.jobTitle"), ui.input(c.jobTitle, { oninput: (e) => (c.jobTitle = e.target.value) })),
      ui.field(t("common.source"), ui.select(Object.keys(window.CRM.i18n.DICT.en.sources).map((k) => ({ value: k, label: t("sources." + k) })), c.source, (v) => (c.source = v))),
      ui.field(t("common.owner"), ui.select(ui.memberOptions(), c.ownerId, (v) => (c.ownerId = v))),
      ui.field(t("common.tags"), ui.tagInput(c.tags, (arr) => (c.tags = arr)), { full: true }),
      ui.field(t("common.notes"), ui.textarea(c.notes, { oninput: (e) => (c.notes = e.target.value) }), { full: true }),
    ]));
    m.setFooter([
      h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => {
        if (!c.firstName && !c.lastName) { ui.toast(t("common.required") + ": " + t("contacts.firstName"), "error"); return; }
        if (existing) { store.updateContact(existing.id, c); ui.toast(t("common.saved"), "success"); }
        else { store.addContact(c); ui.toast(t("common.created"), "success"); }
        m.close(); window.CRM.app.rerender();
      } }, t("common.save")),
    ]);
  }

  // helpers
  function kv(k, v) { return [h("dt", k), h("dd", v)]; }
  function companyName(id) { const c = id && S().byId("companies", id); return c ? c.name : null; }
  function toggleSort(key) { if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; else { state.sortKey = key; state.sortDir = "asc"; } }

  window.CRM.views.contacts = { render, openForm };
})();
