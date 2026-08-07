/* ============================================================ Pipeline (Kanban, drag & drop) ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h, fullName } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);
  const state = { owner: "" };
  let dragId = null;

  function render(root) {
    const store = S();

    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("pipeline.title")), h("div.sub", t("pipeline.sub"))]),
      h("div.spacer"),
      ui.select([{ value: "", label: t("contacts.allOwners") }].concat(store.data.team.map((m) => ({ value: m.id, label: m.name }))), state.owner, (v) => { state.owner = v; window.CRM.app.rerender(); }, { style: "width:auto" }),
      h("button.btn.btn-primary", { onclick: () => openDealForm() }, ["＋ ", t("pipeline.newDeal")]),
    ]));

    if (!store.data.deals.length) {
      root.appendChild(ui.empty("💼", t("pipeline.noDeals"), t("pipeline.noDealsSub"),
        h("button.btn.btn-primary", { onclick: () => openDealForm() }, ["＋ ", t("pipeline.newDeal")])));
      // still show the board frame below for context? No — keep empty state clean.
      return;
    }

    const lostStage = store.data.stages.find((s) => s.isLost);
    // Board contains all non-lost stages; lost handled via a drop zone / status
    const boardStages = store.data.stages.filter((s) => !s.isLost);

    const board = h("div.pipeline");
    boardStages.forEach((stage) => board.appendChild(column(stage)));
    // Closed Lost pseudo-column
    board.appendChild(lostColumn());

    root.appendChild(board);
  }

  function dealsInStage(stageId, opts) {
    opts = opts || {};
    let list = S().data.deals.filter((d) => d.stage === stageId);
    if (opts.lostOnly) list = list.filter((d) => d.status === "lost");
    else list = list.filter((d) => d.status !== "lost");
    if (state.owner) list = list.filter((d) => d.ownerId === state.owner);
    return list;
  }

  function column(stage) {
    const deals = dealsInStage(stage.id);
    const sum = deals.reduce((a, b) => a + (b.value || 0), 0);
    const weighted = deals.reduce((a, b) => a + (b.value || 0) * (b.probability || 0) / 100, 0);
    const body = h("div.pcol-body", deals.map((d) => card(d)));
    body.addEventListener("dragover", (e) => { e.preventDefault(); body.classList.add("drag-over"); });
    body.addEventListener("dragleave", () => body.classList.remove("drag-over"));
    body.addEventListener("drop", (e) => {
      e.preventDefault(); body.classList.remove("drag-over");
      if (dragId) { S().moveDeal(dragId, stage.id); ui.toast(t("pipeline.movedTo", { stage: S().stageName(stage.id) }), "success"); dragId = null; window.CRM.app.rerender(); }
    });
    return h("div.pcol", [
      h("div.pcol-head", [
        h("div.title", [h("span.dot", { style: { background: stage.color, width: "10px", height: "10px" } }), S().stageName(stage.id)]),
        h("span.count", String(deals.length)),
      ]),
      h("div.pcol-sum", [ui.compactCurrency(sum), stage.isWon ? "" : h("span.faint", "  ·  " + t("pipeline.totalWeighted") + " " + ui.compactCurrency(weighted))]),
      body,
    ]);
  }

  function lostColumn() {
    const store = S();
    const lostStage = store.data.stages.find((s) => s.isLost) || { id: "__lost", color: "#ef4444" };
    let deals = store.data.deals.filter((d) => d.status === "lost");
    if (state.owner) deals = deals.filter((d) => d.ownerId === state.owner);
    const body = h("div.pcol-body", deals.map((d) => card(d)));
    body.addEventListener("dragover", (e) => { e.preventDefault(); body.classList.add("drag-over"); });
    body.addEventListener("dragleave", () => body.classList.remove("drag-over"));
    body.addEventListener("drop", (e) => {
      e.preventDefault(); body.classList.remove("drag-over");
      if (dragId) { S().setDealStatus(dragId, "lost"); ui.toast(t("pipeline.lostBanner"), "error"); dragId = null; window.CRM.app.rerender(); }
    });
    const sum = deals.reduce((a, b) => a + (b.value || 0), 0);
    return h("div.pcol", { style: { background: "color-mix(in srgb, #ef4444 6%, var(--bg-sunken))" } }, [
      h("div.pcol-head", [h("div.title", [h("span.dot", { style: { background: "#ef4444", width: "10px", height: "10px" } }), t("pipeline.lostBanner")]), h("span.count", String(deals.length))]),
      h("div.pcol-sum", ui.compactCurrency(sum)),
      body,
    ]);
  }

  function card(d) {
    const store = S();
    const contact = d.contactId ? store.byId("contacts", d.contactId) : null;
    const company = d.companyId ? store.byId("companies", d.companyId) : null;
    const owner = store.member(d.ownerId);
    const days = ui.daysSince(d.stageEnteredAt) || 0;
    const el = h("div.deal-card", { draggable: "true", onclick: () => openDealForm(d) }, [
      h("div.dc-title", d.title || "—"),
      contact ? h("div.dc-row", ["👤 ", fullName(contact)]) : null,
      company ? h("div.dc-row", ["🏢 ", company.name]) : null,
      h("div.prob-bar", h("span", { style: { width: (d.probability || 0) + "%" } })),
      h("div.dc-foot", [
        h("div.dc-value", ui.currency(d.value)),
        h("div.flex", { style: { gap: "6px" } }, [
          h("span.faint", { style: { fontSize: "11px" } }, t("pipeline.daysInStage", { n: days })),
          owner ? ui.avatar(owner, "sm") : null,
        ]),
      ]),
      h("div.flex", { style: { gap: "5px", marginTop: "6px" } }, [
        h("span.pill.blue", { style: { fontSize: "11px" } }, (d.probability || 0) + "%"),
        d.status === "won" ? h("span.pill.green", t("dashboard.won")) : null,
        d.status === "lost" ? h("span.pill.red", t("dashboard.lost")) : null,
      ]),
    ]);
    el.addEventListener("dragstart", (e) => { dragId = d.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    return el;
  }

  // ---------------- FORM ----------------
  function openDealForm(existing, defaults) {
    const store = S();
    const d = existing ? Object.assign({}, existing) : Object.assign({
      title: "", contactId: "", companyId: "", value: 0, probability: 20,
      stage: store.firstOpenStage(), ownerId: store.data.team[0] ? store.data.team[0].id : "", status: "open",
    }, defaults || {});

    const m = ui.modal({ title: existing ? t("pipeline.editDeal") : t("pipeline.newDeal"), icon: "💼", wide: true });

    const stageSel = ui.select(store.data.stages.map((s) => ({ value: s.id, label: store.stageName(s.id) })), d.stage, (v) => (d.stage = v));

    m.setBody(h("div.form-grid", [
      ui.field(t("pipeline.dealTitle") + " *", ui.input(d.title, { oninput: (e) => (d.title = e.target.value) }), { full: true }),
      ui.field(t("common.name"), ui.select(ui.contactOptions(true), d.contactId || "", (v) => {
        d.contactId = v || null;
        const c = v && store.byId("contacts", v); if (c && c.companyId) { d.companyId = c.companyId; }
      })),
      ui.field(t("common.company"), ui.select(ui.companyOptions(true), d.companyId || "", (v) => (d.companyId = v || null))),
      ui.field(t("pipeline.value"), ui.input(d.value, { type: "number", min: "0", oninput: (e) => (d.value = Number(e.target.value) || 0) })),
      ui.field(t("pipeline.probability") + " (%)", ui.input(d.probability, { type: "number", min: "0", max: "100", oninput: (e) => (d.probability = Number(e.target.value) || 0) })),
      ui.field(t("pipeline.stage"), stageSel),
      ui.field(t("common.owner"), ui.select(ui.memberOptions(), d.ownerId, (v) => (d.ownerId = v))),
    ]));

    const foot = [h("button.btn", { onclick: m.close }, t("common.cancel"))];
    if (existing) {
      foot.push(h("button.btn.btn-danger", { onclick: () => { store.deleteDeal(existing.id); m.close(); ui.toast(t("common.deleted"), "success"); window.CRM.app.rerender(); } }, t("common.delete")));
      if (existing.status === "open") {
        foot.push(h("button.btn", { style: { color: "var(--red)" }, onclick: () => { store.setDealStatus(existing.id, "lost"); m.close(); window.CRM.app.rerender(); } }, t("pipeline.markLost")));
        foot.push(h("button.btn", { style: { color: "var(--green)" }, onclick: () => { store.setDealStatus(existing.id, "won"); m.close(); ui.toast(t("pipeline.wonBanner"), "success"); window.CRM.app.rerender(); } }, t("pipeline.markWon")));
      } else {
        foot.push(h("button.btn", { onclick: () => { store.setDealStatus(existing.id, "open"); m.close(); window.CRM.app.rerender(); } }, t("pipeline.reopen")));
      }
    }
    foot.push(h("button.btn.btn-primary", { onclick: () => {
      if (!d.title) { ui.toast(t("common.required"), "error"); return; }
      if (existing) { store.updateDeal(existing.id, d); ui.toast(t("common.saved"), "success"); }
      else { store.addDeal(d); ui.toast(t("common.created"), "success"); }
      m.close(); window.CRM.app.rerender();
    } }, t("common.save")));
    m.setFooter(foot);
  }

  window.CRM.views.pipeline = { render, openDealForm };
})();
