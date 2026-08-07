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
    root.appendChild(h("div.mt-16", calendarsCard()));
    root.appendChild(h("div.mt-16", dataCard()));
  }

  // ---------------- Calendars ----------------
  const CAL_TYPES = [
    { id: "personal",   ico: "👤", multi: false, seats: false, location: true },
    { id: "round_robin",ico: "🔁", multi: true,  seats: false, location: false },
    { id: "class",      ico: "👥", multi: false, seats: true,  location: true },
    { id: "collective", ico: "🧑‍🤝‍🧑", multi: true,  seats: false, location: false },
  ];
  function calType(id) { return CAL_TYPES.find((x) => x.id === id) || CAL_TYPES[0]; }
  const tc = (k, v) => window.CRM.i18n.t("calendars." + k, v);

  function calendarsCard() {
    const store = S();
    const cals = store.data.calendars;
    return h("div.card.card-pad", [
      h("div.flex.between.mb-8", [h("h3", { style: { fontSize: "15px" } }, "📅 " + tc("title")),
        h("button.btn.btn-sm.btn-primary", { onclick: chooseType }, "＋ " + tc("new"))]),
      h("p.faint.mb-16", { style: { fontSize: "12.5px" } }, tc("sub")),
      cals.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, cals.map((c) => calRow(c)))
        : h("div.empty", { style: { padding: "28px" } }, [h("div.emoji", { style: { fontSize: "30px" } }, "📅"), h("h3", tc("none")), h("p", tc("noneSub"))]),
    ]);
  }

  function calRow(c) {
    const store = S();
    const type = calType(c.type);
    const members = (c.memberIds || []).map((id) => store.member(id)).filter(Boolean);
    const url = bookingUrl(c);
    return h("div.flex.between", { style: { padding: "12px", background: "var(--bg-sunken)", borderRadius: "10px", gap: "10px", flexWrap: "wrap" } }, [
      h("div.flex", { style: { gap: "11px", minWidth: 0 } }, [
        h("div.avatar", { style: { background: c.color || "var(--brand-1)", borderRadius: "10px" } }, type.ico),
        h("div", { style: { minWidth: 0 } }, [
          h("div.flex", { style: { gap: "8px", flexWrap: "wrap" } }, [h("strong", c.name || tc("new")), h("span.tag.brand", tc("types." + c.type + ".name"))]),
          h("div.faint", { style: { fontSize: "12px", marginTop: "2px" } }, [
            "🔗 /widget/bookings/" + c.slug, " · ", (c.durationValue || 30) + " " + tc("minutes").toLowerCase(),
            members.length ? " · " + members.length + " " + tc(members.length === 1 ? "member" : "members") : "",
          ]),
        ]),
      ]),
      h("div.flex", { style: { gap: "6px" } }, [
        members.length ? h("div.avatar-stack", members.slice(0, 4).map((m) => ui.avatar(m, "sm"))) : null,
        h("button.btn.btn-sm.btn-ghost", { title: tc("copyLink"), onclick: () => copyLink(url) }, "🔗"),
        h("button.btn.btn-sm.btn-ghost", { title: t("caledit.advanced"), onclick: () => (location.hash = "#/calendar/" + c.id) }, "⚙️"),
        h("button.btn.btn-sm.btn-ghost", { onclick: () => quickForm(c) }, "✏️"),
        h("button.btn.btn-sm.btn-ghost", { onclick: () => ui.confirm(t("common.deleteConfirm"), () => { store.deleteCalendarFromCloud(c); store.deleteCalendar(c.id); ui.toast(t("common.deleted"), "success"); window.CRM.app.rerender(); }) }, "🗑️"),
      ]),
    ]);
  }

  function bookingUrl(c) { return location.origin + location.pathname + "#/book/" + c.slug; }
  function copyLink(url) {
    try { navigator.clipboard.writeText(url); ui.toast(tc("copied"), "success"); }
    catch (e) { ui.toast(url); }
  }

  // Step 1: choose a calendar type
  function chooseType() {
    const m = ui.modal({ title: tc("chooseType"), icon: "📅", wide: true });
    m.setBody(h("div.grid.grid-2", CAL_TYPES.map((tp) =>
      h("div.card.card-pad.type-card", { onclick: () => { m.close(); quickForm(null, tp.id); } }, [
        h("div.flex", { style: { gap: "10px", alignItems: "center", marginBottom: "8px" } }, [
          h("div.avatar", { style: { background: "var(--brand-grad)", borderRadius: "10px" } }, tp.ico),
          h("strong", tc("types." + tp.id + ".name")),
        ]),
        h("p.faint", { style: { fontSize: "12.5px", margin: 0 } }, tc("types." + tp.id + ".desc")),
      ]))));
  }

  // Step 2: quick "New calendar" modal (matches the reference screens per type)
  function quickForm(existing, typeId) {
    const store = S();
    const type = calType(existing ? existing.type : typeId);
    const c = existing ? Object.assign({}, existing, { memberIds: (existing.memberIds || []).slice() })
      : store.addCalendar ? Object.assign({ type: type.id, memberIds: [], name: "", slug: "", description: "", durationValue: 30, durationUnit: "minutes", seatsPerClass: 1, locationCustom: "" }, {}) : {};
    let showDesc = !!(c.description);
    const m = ui.modal({ title: (existing ? t("caledit.edit") : tc("new")), icon: "📅" });

    const descField = h("div.field.full.hidden", [h("label", tc("description")), ui.textarea(c.description, { placeholder: tc("descriptionPh"), oninput: (e) => (c.description = e.target.value) })]);
    const addDescLink = h("span.link", { onclick: () => { showDesc = !showDesc; descField.classList.toggle("hidden", !showDesc); addDescLink.classList.toggle("hidden", showDesc); } }, "＋ " + tc("addDescription"));
    if (showDesc) { descField.classList.remove("hidden"); addDescLink.classList.add("hidden"); }

    // member selector: single (select) or multi (chips)
    const memberControl = type.multi
      ? memberChips(c.memberIds, (ids) => (c.memberIds = ids))
      : ui.select([{ value: "", label: tc("pleaseSelect") }].concat(store.data.team.map((mm) => ({ value: mm.id, label: mm.name }))), c.memberIds[0] || "", (v) => (c.memberIds = v ? [v] : []));

    const slugInput = ui.input(c.slug, { placeholder: "my-calendar", oninput: (e) => (c.slug = e.target.value) });

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
      h("div.field", [h("label", tc("name")), ui.input(c.name, { placeholder: tc("namePh"), oninput: (e) => { c.name = e.target.value; if (!c.slug) slugInput.value = store.slugify(c.name); } })]),
      addDescLink, descField,
      h("div.field", [h("label", type.multi ? tc("selectMembers") : tc("selectMember")), memberControl]),
      h("div.field", [h("label", tc("customUrl")), h("div.url-field", [h("span.url-prefix", "/widget/bookings/"), slugInput])]),
      h("div.flex", { style: { gap: "12px", alignItems: "flex-end" } }, [
        h("div.field", { style: { flex: 1 } }, [h("label", tc("duration")), ui.input(c.durationValue, { type: "number", min: "5", oninput: (e) => (c.durationValue = Number(e.target.value) || 30) })]),
        h("div.field", { style: { width: "140px" } }, [h("label", " "), ui.select([{ value: "minutes", label: tc("minutes") }, { value: "hours", label: tc("hours") }], c.durationUnit, (v) => (c.durationUnit = v))]),
      ]),
      type.seats ? h("div.field", [h("label", tc("seatsPerClass")), ui.input(c.seatsPerClass, { type: "number", min: "1", oninput: (e) => (c.seatsPerClass = Number(e.target.value) || 1) })]) : null,
      type.location ? h("div.field", [h("label", tc("meetingLocation")), ui.input(c.locationCustom, { placeholder: tc("locationPh"), oninput: (e) => (c.locationCustom = e.target.value) })]) : null,
      h("p.faint", { style: { fontSize: "12px", margin: 0 } }, "To further customize your business hours, please head to the advanced settings."),
    ]);
    m.setBody(body);

    function save(goAdvanced) {
      if (!c.name) { ui.toast(t("common.required") + ": " + tc("name"), "error"); return; }
      if (!c.memberIds || !c.memberIds.length) { ui.toast(tc("selectAtLeastOne"), "error"); return; }
      let saved;
      if (existing) { saved = store.updateCalendar(existing.id, c); ui.toast(t("common.saved"), "success"); }
      else { saved = store.addCalendar(c); ui.toast(t("common.created"), "success"); }
      if (saved) store.saveCalendarToCloud(saved);
      m.close();
      if (goAdvanced && saved) location.hash = "#/calendar/" + saved.id;
      else window.CRM.app.rerender();
    }

    m.setFooter([
      h("button.btn.btn-ghost", { style: { marginRight: "auto", color: "var(--brand-1)" }, onclick: () => save(true) }, "⚙️ " + tc("advanced")),
      h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => save(false) }, tc("confirm")),
    ]);
  }

  // multi-select team members as toggle chips
  function memberChips(selectedIds, onChange) {
    const store = S();
    selectedIds = (selectedIds || []).slice();
    const wrap = h("div.flex.wrap", { style: { gap: "8px" } });
    function render() {
      ui.clear(wrap);
      store.data.team.forEach((mm) => {
        const on = selectedIds.includes(mm.id);
        wrap.appendChild(h("button.member-chip" + (on ? ".on" : ""), { type: "button", onclick: () => {
          if (on) selectedIds = selectedIds.filter((x) => x !== mm.id); else selectedIds.push(mm.id);
          onChange(selectedIds.slice()); render();
        } }, [ui.avatar(mm, "sm"), h("span", mm.name), on ? h("span", "✓") : null]));
      });
    }
    render();
    return wrap;
  }

  // exposed for the calendar editor to reuse
  window.CRM.settingsHelpers = { CAL_TYPES: CAL_TYPES, calType: calType, memberChips: memberChips, bookingUrl: bookingUrl, copyLink: copyLink };

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
      h("div.field.mb-16", [
        h("label", "💱 " + t("settings.currency")),
        ui.select([{ value: "USD", label: "USD $" }, { value: "MXN", label: "MXN MX$" }, { value: "EUR", label: "EUR €" }], store.data.settings.currency || "USD", (v) => { store.setSetting("currency", v); ui.toast(t("common.saved"), "success"); window.CRM.app.rerender(); }, { style: "max-width:200px" }),
      ]),
      // Session
      sessionRow(),
    ]);
  }

  function sessionRow() {
    const me = S().currentUser();
    return h("div.field", [
      h("label", "🔐 " + t("auth.loggedInAs")),
      h("div.flex.between", { style: { gap: "10px", padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "10px" } }, [
        h("div.flex", { style: { gap: "10px" } }, [me ? ui.avatar(me) : null, h("div", [h("strong", me ? me.name : "—"), h("div.faint", { style: { fontSize: "12px" } }, me ? me.email : "")])]),
        h("button.btn.btn-sm.btn-danger", { onclick: () => window.CRM.auth.logout() }, "⏻ " + t("auth.signOut")),
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
    const m = existing ? Object.assign({}, existing) : { name: "", email: "", role: "sales", password: "" };
    const modal = ui.modal({ title: existing ? t("common.edit") : t("settings.addMember"), icon: "👤" });
    modal.setBody(h("div.form-grid", [
      ui.field(t("settings.memberName") + " *", ui.input(m.name, { oninput: (e) => (m.name = e.target.value) }), { full: true }),
      ui.field(t("settings.memberEmail") + " *", ui.input(m.email, { type: "email", oninput: (e) => (m.email = e.target.value) })),
      ui.field(t("settings.memberRole"), ui.select(["admin", "manager", "sales"].map((r) => ({ value: r, label: t("roles." + r) })), m.role, (v) => (m.role = v))),
      ui.field("🔑 " + t("settings.password"), ui.input(m.password || "", { type: "text", oninput: (e) => (m.password = e.target.value), placeholder: "inflate2025" }), { full: true, hint: t("settings.passwordHint") }),
    ]));
    modal.setFooter([h("button.btn", { onclick: modal.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => {
        if (!m.name || !m.email) { ui.toast(t("common.required"), "error"); return; }
        if (!m.password) m.password = "inflate2025";
        if (existing) store.updateMember(existing.id, m); else store.addMember(m);
        modal.close(); window.CRM.app.rerender();
      } }, t("common.save"))]);
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
