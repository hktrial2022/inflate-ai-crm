/* ============================================================ Settings (incl. bilingual EN/ES selector) ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  function render(root) {
    const store = S();

    root.appendChild(h("div.view-head", [h("div", [h("h1", t("settings.title")), h("div.sub", t("settings.sub"))])]));

    root.appendChild(h("div.grid.grid-2", [
      generalCard(),
      teamCard(),
    ]));
    root.appendChild(h("div.mt-16", stagesCard()));
    root.appendChild(h("div.mt-16", dataCard()));
  }

  function generalCard() {
    const store = S();
    const lang = window.CRM.i18n.getLang();
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    return h("div.card.card-pad", [
      h("h3.mb-16", { style: { fontSize: "15px" } }, "⚙️ " + t("settings.general")),
      // Language selector
      h("div.field.mb-16", [
        h("label", "🌐 " + t("settings.language")),
        h("div.flex", { style: { gap: "8px" } }, [
          langBtn("en", "🇺🇸 English", lang),
          langBtn("es", "🇲🇽 Español", lang),
        ]),
      ]),
      // Theme
      h("div.field.mb-16", [
        h("label", "🎨 " + t("settings.theme")),
        h("div.flex", { style: { gap: "8px" } }, [
          themeBtn("light", "☀️ " + t("settings.light"), theme),
          themeBtn("dark", "🌙 " + t("settings.dark"), theme),
        ]),
      ]),
      // Currency
      h("div.field", [
        h("label", "💱 " + t("settings.currency")),
        ui.select([{ value: "USD", label: "USD $" }, { value: "MXN", label: "MXN MX$" }, { value: "EUR", label: "EUR €" }], store.data.settings.currency || "USD", (v) => { store.setSetting("currency", v); ui.toast(t("common.saved"), "success"); window.CRM.app.rerender(); }, { style: "max-width:200px" }),
      ]),
    ]);
  }
  function langBtn(code, label, current) {
    return h("button.btn" + (current === code ? ".btn-primary" : ""), { onclick: () => { window.CRM.i18n.setLang(code); window.CRM.app.applyChrome(); window.CRM.app.rerender(); ui.toast(t("common.saved"), "success"); } }, label);
  }
  function themeBtn(name, label, current) {
    return h("button.btn" + (current === name ? ".btn-primary" : ""), { onclick: () => { window.CRM.app.setTheme(name); window.CRM.app.rerender(); } }, label);
  }

  function teamCard() {
    const store = S();
    return h("div.card.card-pad", [
      h("div.flex.between.mb-16", [h("h3", { style: { fontSize: "15px" } }, "👥 " + t("settings.team")),
        h("button.btn.btn-sm.btn-primary", { onclick: () => editMember() }, "＋ " + t("settings.addMember"))]),
      h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, store.data.team.map((m) =>
        h("div.flex.between", { style: { padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "9px" } }, [
          h("div.flex", { style: { gap: "10px" } }, [ui.avatar(m), h("div", [h("strong", m.name), h("div.faint", { style: { fontSize: "12px" } }, (m.email || "") + " · " + t("roles." + m.role))])]),
          h("div.flex", { style: { gap: "4px" } }, [
            h("button.btn.btn-sm.btn-ghost", { onclick: () => editMember(m) }, "✏️"),
            store.data.team.length > 1 ? h("button.btn.btn-sm.btn-ghost", { onclick: () => { store.deleteMember(m.id); window.CRM.app.rerender(); } }, "🗑️") : null,
          ]),
        ]))),
    ]);
  }
  function editMember(existing) {
    const store = S();
    const m = existing ? Object.assign({}, existing) : { name: "", email: "", role: "sales" };
    const modal = ui.modal({ title: existing ? t("common.edit") : t("settings.addMember"), icon: "👤" });
    modal.setBody(h("div.form-grid", [
      ui.field(t("settings.memberName") + " *", ui.input(m.name, { oninput: (e) => (m.name = e.target.value) }), { full: true }),
      ui.field(t("settings.memberEmail"), ui.input(m.email, { oninput: (e) => (m.email = e.target.value) })),
      ui.field(t("settings.memberRole"), ui.select(["admin", "manager", "sales"].map((r) => ({ value: r, label: t("roles." + r) })), m.role, (v) => (m.role = v))),
    ]));
    modal.setFooter([h("button.btn", { onclick: modal.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => { if (!m.name) { ui.toast(t("common.required"), "error"); return; } if (existing) store.updateMember(existing.id, m); else store.addMember(m); modal.close(); window.CRM.app.rerender(); } }, t("common.save"))]);
  }

  function stagesCard() {
    const store = S();
    const lang = window.CRM.i18n.getLang();
    const stages = store.data.stages.map((s) => ({ ...s, name: { ...s.name } }));

    function commit() { store.updateStages(stages); }

    const rows = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    function renderRows() {
      ui.clear(rows);
      stages.forEach((s, i) => {
        rows.appendChild(h("div.flex", { style: { gap: "10px", padding: "8px", background: "var(--bg-sunken)", borderRadius: "9px" } }, [
          h("input", { type: "color", value: s.color, style: "width:36px;height:36px;border:none;background:none;cursor:pointer", oninput: (e) => { s.color = e.target.value; commit(); } }),
          ui.input(s.name[lang] || s.name.en, { oninput: (e) => { s.name[lang] = e.target.value; commit(); } }),
          h("label.flex", { style: { gap: "5px", whiteSpace: "nowrap", fontSize: "12px" } }, [h("input", { type: "checkbox", checked: s.isWon, onchange: (e) => { s.isWon = e.target.checked; if (e.target.checked) s.isLost = false; commit(); renderRows(); } }), t("settings.stageIsWon")]),
          h("label.flex", { style: { gap: "5px", whiteSpace: "nowrap", fontSize: "12px" } }, [h("input", { type: "checkbox", checked: s.isLost, onchange: (e) => { s.isLost = e.target.checked; if (e.target.checked) s.isWon = false; commit(); renderRows(); } }), t("settings.stageIsLost")]),
          stages.length > 2 ? h("button.btn.btn-sm.btn-ghost", { onclick: () => { stages.splice(i, 1); commit(); renderRows(); } }, "🗑️") : null,
        ]));
      });
    }
    renderRows();

    return h("div.card.card-pad", [
      h("div.flex.between.mb-8", [h("h3", { style: { fontSize: "15px" } }, "📊 " + t("settings.stages")),
        h("button.btn.btn-sm.btn-primary", { onclick: () => { const id = store.uid("stage"); stages.push({ id, name: { en: "New Stage", es: "Nueva Etapa" }, color: "#8b5cf6", isWon: false, isLost: false }); commit(); renderRows(); } }, "＋ " + t("settings.addStage"))]),
      h("p.faint.mb-16", { style: { fontSize: "12.5px" } }, t("settings.customStages")),
      rows,
    ]);
  }

  function dataCard() {
    const store = S();
    return h("div.card.card-pad", [
      h("h3.mb-8", { style: { fontSize: "15px" } }, "💾 " + t("settings.data")),
      h("p.faint.mb-16", { style: { fontSize: "12.5px" } }, t("settings.dataDesc")),
      h("div.flex.wrap", { style: { gap: "10px" } }, [
        h("button.btn", { onclick: exportData }, "⬇️ " + t("settings.exportData")),
        h("button.btn", { onclick: importData }, "⬆️ " + t("settings.importData")),
        h("button.btn.btn-danger", { onclick: () => ui.confirm(t("settings.resetConfirm"), () => { store.resetAll(); ui.toast(t("common.deleted"), "success"); location.hash = "#/dashboard"; window.CRM.app.rerender(); }) }, "🗑️ " + t("settings.resetData")),
      ]),
      h("div.divider"),
      h("p.faint", { style: { fontSize: "12px" } }, "🗄️ " + t("settings.aboutStorage") + " — " + t("settings.supabaseNote")),
    ]);
  }

  function exportData() {
    const blob = new Blob([S().exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "inflate-crm-backup.json"; a.click();
    URL.revokeObjectURL(url);
    ui.toast(t("settings.exported"), "success");
  }
  function importData() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { if (S().importJSON(reader.result)) { ui.toast(t("settings.imported"), "success"); window.CRM.app.rerender(); } else ui.toast("Error", "error"); };
      reader.readAsText(file);
    };
    inp.click();
  }

  window.CRM.views.settings = { render };
})();
