/* ============================================================ Dashboard (Analytics) ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const { h, currency, compactCurrency } = window.CRM.ui;
  const S = () => window.CRM.store;
  const C = () => window.CRM.charts;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  function render(root) {
    const store = S();
    const d = store.data;
    const deals = d.deals;
    const open = store.openDeals();
    const won = store.wonDeals();
    const lost = store.lostDeals();

    const hasData = d.contacts.length || deals.length;

    const head = h("div.view-head", [
      h("div", [h("h1", t("dashboard.title")), h("div.sub", t("dashboard.sub"))]),
    ]);

    if (!hasData) {
      root.appendChild(head);
      root.appendChild(window.CRM.ui.empty("📊", t("dashboard.noData"), t("dashboard.noDataSub"),
        h("button.btn.btn-primary", { onclick: () => location.hash = "#/contacts" }, t("contacts.newContact"))));
      return;
    }

    // ---- KPIs ----
    const pipelineValue = open.reduce((a, b) => a + (b.value || 0), 0);
    const wonValue = won.reduce((a, b) => a + (b.value || 0), 0);
    const closedTotal = won.length + lost.length;
    const winRate = closedTotal ? Math.round((won.length / closedTotal) * 100) : 0;
    const avgClose = avgTimeToClose(won);
    const newLeads30 = d.contacts.filter((c) => daysAgo(c.createdAt) <= 30).length;

    const kpis = h("div.grid.grid-4", [
      stat(t("dashboard.totalPipeline"), compactCurrency(pipelineValue), "💰", `${open.length} ${t("dashboard.openDeals").toLowerCase()}`),
      stat(t("dashboard.wonValue"), compactCurrency(wonValue), "🏆", `${won.length} ${t("dashboard.won").toLowerCase()}`),
      stat(t("dashboard.winRate"), winRate + "%", "🎯", `${won.length}/${closedTotal || 0}`),
      stat(t("dashboard.avgClose"), avgClose != null ? avgClose + " " + t("dashboard.days") : "—", "⏱️", t("dashboard.newLeads") + ": " + newLeads30),
    ]);

    // ---- Funnel ----
    const openStages = d.stages.filter((s) => !s.isLost);
    const funnelData = openStages.map((s, i) => {
      const count = deals.filter((dd) => stageIndex(dd) >= i && dd.status !== "lost").length;
      return { label: store.stageName(s.id), value: count, color: s.color };
    });
    // conv rate stage to stage
    funnelData.forEach((f, i) => { f.conv = i === 0 ? 100 : (funnelData[i - 1].value ? Math.round((f.value / funnelData[i - 1].value) * 100) : 0); });

    // ---- Pipeline value by stage ----
    const valueByStage = d.stages.filter((s) => !s.isLost).map((s) => ({
      label: store.stageName(s.id), color: s.color,
      value: deals.filter((dd) => dd.stage === s.id && dd.status !== "lost").reduce((a, b) => a + (b.value || 0), 0),
    }));

    // ---- Lead sources ----
    const srcCounts = {};
    d.contacts.forEach((c) => { srcCounts[c.source || "other"] = (srcCounts[c.source || "other"] || 0) + 1; });
    const sourceData = Object.keys(srcCounts).map((k, i) => ({ label: t("sources." + k) || k, value: srcCounts[k], color: C().PALETTE[i % C().PALETTE.length] }));

    // ---- Weekly new leads trend ----
    const trend = weeklyTrend(d.contacts);

    // ---- Won vs lost value ----
    const wonLost = [
      { label: t("dashboard.won"), value: wonValue, color: "#16a34a" },
      { label: t("dashboard.lost"), value: lost.reduce((a, b) => a + (b.value || 0), 0), color: "#ef4444" },
    ];

    const grid1 = h("div.grid.grid-2.mt-24", [
      panel(t("dashboard.conversionFunnel"), C().funnel(funnelData)),
      panel(t("dashboard.pipelineByStage"), C().bar(valueByStage, { currency: true, height: 240 })),
    ]);
    const grid2 = h("div.grid.grid-2.mt-24", [
      panel(t("dashboard.leadsTrend"), C().line(trend, { height: 220 })),
      panel(t("dashboard.leadSources"), h("div.flex", { style: { gap: "18px", flexWrap: "wrap", justifyContent: "center" } }, [
        C().donut(sourceData, { centerLabel: t("contacts.title") }), C().legend(sourceData),
      ])),
    ]);
    const grid3 = h("div.grid.grid-2.mt-24", [
      panel(t("dashboard.wonVsLost"), C().bar(wonLost, { currency: true, height: 200 })),
      panel(t("common.owner"), byOwnerTable()),
    ]);

    root.appendChild(head);
    root.appendChild(kpis);
    root.appendChild(grid1);
    root.appendChild(grid2);
    root.appendChild(grid3);
  }

  function byOwnerTable() {
    const store = S();
    const rows = store.data.team.map((m) => {
      const od = store.data.deals.filter((x) => x.ownerId === m.id && x.status === "open");
      const w = store.data.deals.filter((x) => x.ownerId === m.id && x.status === "won");
      return { m, open: od.length, openVal: od.reduce((a, b) => a + (b.value || 0), 0), won: w.length, wonVal: w.reduce((a, b) => a + (b.value || 0), 0) };
    }).filter((r) => r.open || r.won);
    if (!rows.length) return h("p.faint", { style: { padding: "10px 0" } }, t("dashboard.noData"));
    return h("div.table-wrap", { style: { boxShadow: "none", border: "none" } }, h("table.data", [
      h("thead", h("tr", [h("th", t("common.owner")), h("th", t("dashboard.openDeals")), h("th", t("dashboard.wonValue"))])),
      h("tbody", rows.map((r) => h("tr", [
        h("td", window.CRM.ui.ownerCell(r.m.id)),
        h("td", `${r.open} · ${compactCurrency(r.openVal)}`),
        h("td", `${r.won} · ${compactCurrency(r.wonVal)}`),
      ]))),
    ]));
  }

  // helpers
  function stat(label, value, ico, delta) {
    return h("div.stat", [
      h("div.stat-ico", ico),
      h("div.stat-label", label),
      h("div.stat-value", value),
      h("div.stat-delta", h("span.faint", delta)),
    ]);
  }
  function panel(title, body) { return h("div.card.card-pad", [h("h3.mb-16", { style: { fontSize: "15px" } }, title), body]); }
  function daysAgo(iso) { return window.CRM.ui.daysSince(iso) || 0; }
  function stageIndex(deal) { const st = S().data.stages; return st.findIndex((s) => s.id === deal.stage); }
  function avgTimeToClose(won) {
    if (!won.length) return null;
    const ds = won.map((d) => window.CRM.ui.daysBetween(d.createdAt, d.stageEnteredAt));
    return Math.round(ds.reduce((a, b) => a + b, 0) / ds.length);
  }
  function weeklyTrend(contacts) {
    const weeks = 8; const buckets = new Array(weeks).fill(0);
    const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - (weeks * 7 - 1));
    contacts.forEach((c) => {
      const dd = new Date(c.createdAt);
      const idx = Math.floor((dd - start) / (7 * 86400000));
      if (idx >= 0 && idx < weeks) buckets[idx]++;
    });
    return buckets.map((v, i) => {
      const wd = new Date(start); wd.setDate(start.getDate() + i * 7);
      return { label: wd.toLocaleDateString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" }), value: v };
    });
  }

  window.CRM.views.dashboard = { render };
})();
