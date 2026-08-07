/* ============================================================ Calendar Editor — full-page advanced settings (8 tabs) ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t("caledit." + k, v);
  const tc = (k, v) => window.CRM.i18n.t("calendars." + k, v);

  const NAV = [
    { id: "basic", ico: "📝" }, { id: "staff", ico: "👥" }, { id: "availability", ico: "🗓️" }, { id: "rules", ico: "📏" },
    { sep: true }, { id: "form", ico: "📋" }, { id: "payments", ico: "💳" }, { id: "notifications", ico: "🔔" }, { id: "widget", ico: "🎨" },
  ];
  const TIPS = {
    basic: "tipBasic", staff: "tipStaff", availability: "tipAvail", rules: "tipRules",
    form: "tipForm", payments: "tipPayments", notifications: "tipNotif", widget: null,
  };

  function render(root, params) {
    const store = S();
    const cal = params && params.id ? store.byId("calendars", params.id) : null;
    if (!cal) { location.hash = "#/settings"; return; }
    const w = JSON.parse(JSON.stringify(cal)); // working copy
    let active = "basic";

    const panel = h("div.cal-panel");
    const navEl = h("div.cal-nav");
    const tipEl = h("div.cal-tip");

    function type() { return window.CRM.settingsHelpers.calType(w.type); }

    function renderNav() {
      ui.clear(navEl);
      NAV.forEach((it) => {
        if (it.sep) { navEl.appendChild(h("div.cal-nav-group", "▾ " + t("nav.advanced"))); return; }
        navEl.appendChild(h("button.cal-nav-item" + (active === it.id ? ".active" : ""), { onclick: () => { active = it.id; renderNav(); renderPanel(); } }, [h("span", it.ico), h("span", t("nav." + it.id))]));
      });
    }
    function renderTip() {
      const key = TIPS[active];
      ui.clear(tipEl);
      if (key) tipEl.appendChild(h("div", [h("div.flex", { style: { gap: "6px", fontWeight: 700, marginBottom: "6px" } }, ["💡", t("quickTip")]), h("p.faint", { style: { fontSize: "12px", margin: 0 } }, t(key))]));
    }
    function renderPanel() { ui.mount(panel, (TABS[active] || TABS.basic)(w)); renderTip(); }

    function save() { const saved = store.updateCalendar(cal.id, w); store.saveCalendarToCloud(saved); ui.toast(t("saved"), "success"); }

    const header = h("div.cal-header", [
      h("button.btn.btn-ghost", { onclick: () => (location.hash = "#/settings") }, "← " + t("back")),
      h("div.cal-header-title", w.name || tc("new")),
      h("div.flex", { style: { gap: "8px" } }, [
        h("button.btn.btn-sm.btn-ghost", { title: tc("copyLink"), onclick: () => window.CRM.settingsHelpers.copyLink(window.CRM.settingsHelpers.bookingUrl(w)) }, "🔗"),
        h("button.btn.btn-primary", { onclick: save }, "💾 " + t("save")),
      ]),
    ]);

    root.appendChild(header);
    root.appendChild(h("div.cal-editor", [
      h("div", [navEl, h("div.cal-tip-wrap", tipEl)]),
      panel,
    ]));
    renderNav(); renderPanel();
  }

  // ---------- shared field helpers ----------
  function panelCard(titleKey, subKey, body) {
    return h("div.card.card-pad.mb-16", [
      h("h3", { style: { fontSize: "16px" } }, t(titleKey)),
      subKey ? h("p.faint.mb-16", { style: { fontSize: "13px", marginTop: "4px" } }, t(subKey)) : null,
      h("div.divider", { style: { marginTop: subKey ? "0" : "12px" } }),
      body,
    ]);
  }
  function field(label, control, full) { return h("div.field" + (full ? ".full" : ""), [label ? h("label", label) : null, control]); }
  function numUnit(w, vKey, uKey, units, min) {
    return h("div.num-unit", [
      ui.input(w[vKey], { type: "number", min: min == null ? "0" : String(min), oninput: (e) => (w[vKey] = e.target.value === "" ? null : Number(e.target.value)) }),
      ui.select(units.map((u) => ({ value: u, label: t(u) })), w[uKey], (v) => (w[uKey] = v)),
    ]);
  }
  function toggleRow(w, key, label, sub) {
    const sw = h("button.switch" + (w[key] ? ".on" : ""), { type: "button", onclick: () => { w[key] = !w[key]; sw.classList.toggle("on", w[key]); if (sub && sub._onToggle) sub._onToggle(w[key]); } }, h("span.switch-knob"));
    return h("div.toggle-row", [sw, h("div", [h("strong", label), sub && sub.text ? h("div.faint", { style: { fontSize: "12px", marginTop: "2px" } }, sub.text) : null])]);
  }
  function colorField(w, key) {
    const input = ui.input(w[key], { oninput: (e) => { w[key] = e.target.value; swatch.style.background = e.target.value; } });
    const swatch = h("input", { type: "color", value: w[key], style: "width:34px;height:34px;border:none;background:none;cursor:pointer;padding:0", oninput: (e) => { w[key] = e.target.value; input.value = e.target.value; } });
    return h("div.color-field", [swatch, input]);
  }
  function uploader(w, key, hintKey) {
    const box = h("div.uploader");
    function paint() {
      ui.clear(box);
      if (w[key]) box.appendChild(h("img", { src: w[key], style: "max-height:120px;max-width:100%;border-radius:8px" }));
      else box.appendChild(h("div", [h("div", { style: { fontSize: "26px" } }, "☁️"), h("div.link", { style: { marginTop: "6px" } }, "Click to upload"), h("div.faint", { style: { fontSize: "11.5px", marginTop: "4px" } }, t(hintKey))]));
    }
    box.onclick = () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { w[key] = r.result; paint(); ui.toast(t("uploaded"), "success"); }; r.readAsDataURL(f); };
      inp.click();
    };
    paint();
    return box;
  }

  // ---------- TAB: Basic details ----------
  function basicTab(w) {
    const store = S();
    const slugInput = ui.input(w.slug, { placeholder: "my-calendar", oninput: (e) => (w.slug = e.target.value) });
    return panelCard("basicTitle", "basicSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, [
      field(t("logo"), uploader(w, "logo", "logoHint")),
      field(tc("name"), ui.input(w.name, { placeholder: tc("namePh"), oninput: (e) => (w.name = e.target.value) })),
      field(tc("description"), ui.textarea(w.description, { placeholder: tc("descriptionPh"), oninput: (e) => (w.description = e.target.value) })),
      field(tc("customUrl"), h("div.url-field", [h("span.url-prefix", "/widget/bookings/"), slugInput])),
      h("div.grid.grid-2", [
        field(t("group"), ui.input(w.group, { placeholder: "—", oninput: (e) => (w.group = e.target.value) })),
        field(t("inviteTitle"), ui.input(w.inviteTitle, { oninput: (e) => (w.inviteTitle = e.target.value) })),
      ]),
      field(t("color"), swatches(w, "color")),
    ]));
  }
  function swatches(w, key) {
    const COLORS = ["#dc2626", "#f87171", "#ea580c", "#eab308", "#22c55e", "#15803d", "#06b6d4", "#2563eb", "#6366f1", "#a855f7", "#7c3aed", "#64748b"];
    const wrap = h("div.flex.wrap", { style: { gap: "8px" } });
    COLORS.forEach((col) => {
      const b = h("button.swatch" + (w[key] === col ? ".on" : ""), { type: "button", style: { background: col }, onclick: () => { w[key] = col; wrap.querySelectorAll(".swatch").forEach((x) => x.classList.remove("on")); b.classList.add("on"); } }, w[key] === col ? "✓" : "");
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ---------- TAB: Staff & location ----------
  function staffTab(w) {
    const type = window.CRM.settingsHelpers.calType(w.type);
    const memberCtl = type.multi
      ? window.CRM.settingsHelpers.memberChips(w.memberIds, (ids) => (w.memberIds = ids))
      : ui.select([{ value: "", label: tc("pleaseSelect") }].concat(S().data.team.map((m) => ({ value: m.id, label: m.name }))), (w.memberIds || [])[0] || "", (v) => (w.memberIds = v ? [v] : []));
    const locInput = ui.input(w.locationCustom, { placeholder: t("locationPh"), oninput: (e) => (w.locationCustom = e.target.value) });
    const locWrap = h("div.field" + (w.location === "custom" ? "" : ".hidden"), [h("label", t("meetingLocation")), locInput]);
    const locSelect = ui.select(
      [["custom", "locationCustom"], ["zoom", "locationZoom"], ["google", "locationGoogle"], ["phone", "locationPhone"], ["inperson", "locationInPerson"]].map(([v, k]) => ({ value: v, label: t(k) })),
      w.location, (v) => { w.location = v; locWrap.classList.toggle("hidden", v !== "custom"); });
    return panelCard("staffTitle", "staffSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
      field(t("staffSelect"), memberCtl),
      (!w.memberIds || !w.memberIds.length) ? h("div.field-error", t("staffRequired")) : null,
      field(t("meetingLocation"), locSelect),
      locWrap,
    ]));
  }

  // ---------- TAB: Availability ----------
  function availabilityTab(w) {
    const TZ = ["America/Mexico_City", "America/New_York", "America/Los_Angeles", "America/Chicago", "America/Bogota", "Europe/Madrid", "UTC"];
    return panelCard("availTitle", "availSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
      field(t("timezone"), ui.select(TZ.map((z) => ({ value: z, label: z.replace(/_/g, " ") })), w.timezone, (v) => (w.timezone = v))),
      h("div", [h("div.section-title", t("weeklyHours")), weeklyHours(w)]),
      h("div.divider"),
      toggleRow(w, "recurring", t("recurring")),
    ]));
  }
  function weeklyHours(w) {
    const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    w.businessHours = w.businessHours || S().defaultBusinessHours();
    return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, DAYS.map((d) => {
      const bh = w.businessHours[d] || (w.businessHours[d] = { enabled: false, from: "09:00", to: "17:00" });
      const times = h("div.flex", { style: { gap: "8px" } }, [
        ui.input(bh.from, { type: "time", oninput: (e) => (bh.from = e.target.value) }),
        h("span.faint", "–"),
        ui.input(bh.to, { type: "time", oninput: (e) => (bh.to = e.target.value) }),
      ]);
      times.style.opacity = bh.enabled ? "1" : ".4";
      const sw = h("button.switch" + (bh.enabled ? ".on" : ""), { type: "button", onclick: () => { bh.enabled = !bh.enabled; sw.classList.toggle("on", bh.enabled); times.style.opacity = bh.enabled ? "1" : ".4"; } }, h("span.switch-knob"));
      return h("div.flex", { style: { gap: "12px", padding: "6px 0" } }, [h("div", { style: { width: "110px" } }, h("label.flex", { style: { gap: "9px" } }, [sw, tc("days." + d)])), times]);
    }));
  }

  // ---------- TAB: Booking rules ----------
  function rulesTab(w) {
    const MIN = ["minutes", "hours"]; const DAYS = ["days", "hours"];
    return panelCard("rulesTitle", "rulesSub", h("div.grid.grid-2", { style: { rowGap: "18px" } }, [
      field(t("meetingInterval"), numUnit(w, "intervalValue", "intervalUnit", MIN, 5)),
      field(t("meetingDuration"), numUnit(w, "durationValue", "durationUnit", MIN, 5)),
      field(t("minNotice"), numUnit(w, "minNoticeValue", "minNoticeUnit", DAYS)),
      field(t("dateRange"), numUnit(w, "dateRangeValue", "dateRangeUnit", DAYS)),
      field(t("preBuffer"), numUnit(w, "preBufferValue", "preBufferUnit", MIN)),
      field(t("postBuffer"), numUnit(w, "postBufferValue", "postBufferUnit", MIN)),
      field(t("maxPerDay"), stepper(w, "maxPerDay", 0)),
      field(t("maxPerSlot"), stepper(w, "maxPerSlot", 1)),
      h("div.full", [
        toggleRow(w, "lookBusy", t("lookBusy")),
        h("div.flex", { style: { gap: "8px", marginTop: "8px", maxWidth: "260px" } }, [ui.input(w.lookBusyPct, { type: "number", min: "0", max: "100", oninput: (e) => (w.lookBusyPct = Number(e.target.value) || 0) }), h("span.faint", "%")]),
        h("p.faint", { style: { fontSize: "12px", marginTop: "6px" } }, t("lookBusyHint")),
      ]),
    ]));
  }
  function stepper(w, key, min) {
    if (w[key] == null) w[key] = min;
    const inp = ui.input(w[key], { type: "number", min: String(min), oninput: (e) => (w[key] = Number(e.target.value)) });
    return h("div.stepper", [
      inp,
      h("div.stepper-btns", [
        h("button", { type: "button", onclick: () => { w[key] = Math.max(min, (Number(w[key]) || min) - 1); inp.value = w[key]; } }, "−"),
        h("button", { type: "button", onclick: () => { w[key] = (Number(w[key]) || min) + 1; inp.value = w[key]; } }, "+"),
      ]),
    ]);
  }

  // ---------- TAB: Form & confirmation ----------
  function formTab(w) {
    const consentBox = h("div.field.full" + (w.consent ? "" : ".hidden"), ui.textarea(w.consentText || t("consentText"), { oninput: (e) => (w.consentText = e.target.value) }));
    const redirectBox = h("div.field.full" + (w.confirmType === "redirect" ? "" : ".hidden"), ui.input(w.redirectUrl, { placeholder: "https://…", oninput: (e) => (w.redirectUrl = e.target.value) }));
    return h("div", [
      panelCard("formTitle", "formSub2", h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
        field(t("selectForm"), ui.select([{ value: "default", label: t("defaultForm") }], w.formPreset, (v) => (w.formPreset = v))),
        h("div", [h("div.section-title", t("widgetOrder")), h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
          orderRow(t("step") + " 1", t("dateTimeSelector")), orderRow(t("step") + " 2", t("formStep")),
        ])]),
        h("div.divider"),
        toggleRow(w, "stickyContacts", t("stickyContacts") + " — " + t("prePopulate")),
        (function () { const tr = toggleRow(w, "consent", t("consentCheckbox"), { _onToggle: (on) => consentBox.classList.toggle("hidden", !on) }); return h("div", [tr, consentBox]); })(),
        toggleRow(w, "addGuests", t("guests") + " — " + t("addGuests")),
      ])),
      panelCard("confirmationPage", "confirmationPageSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, [
        h("div.flex", { style: { gap: "18px" } }, [
          radio("confirmType", "default", t("defaultOpt"), w, () => redirectBox.classList.add("hidden")),
          radio("confirmType", "redirect", t("redirectUrl"), w, () => redirectBox.classList.remove("hidden")),
        ]),
        redirectBox,
        field(t("thankYou"), ui.textarea(w.thankYouMsg || t("thankYouDefault"), { oninput: (e) => (w.thankYouMsg = e.target.value) })),
        field(t("metaPixel"), ui.input(w.metaPixel, { placeholder: "Pixel ID", oninput: (e) => (w.metaPixel = e.target.value) })),
        toggleRow(w, "autoConfirm", t("autoConfirm")),
      ])),
    ]);
  }
  function orderRow(step, label) { return h("div.flex", { style: { gap: "12px" } }, [h("span.faint", { style: { width: "56px", fontWeight: 600 } }, step), h("div.order-item", ["⣿ ", label])]); }
  function radio(name, val, label, w, cb) {
    const input = h("input", { type: "radio", name: name, checked: w[name] === val, onchange: () => { w[name] = val; if (cb) cb(); } });
    return h("label.flex", { style: { gap: "8px", cursor: "pointer" } }, [input, label]);
  }

  // ---------- TAB: Payments ----------
  function paymentsTab(w) {
    const detail = h("div", { style: { marginTop: "14px" } });
    function paint() {
      ui.clear(detail);
      if (w.acceptPayments) detail.appendChild(field(t("amount"), h("div.flex", { style: { gap: "8px", maxWidth: "240px" } }, [h("span.faint", { style: { alignSelf: "center" } }, "$"), ui.input(w.paymentAmount, { type: "number", min: "0", oninput: (e) => (w.paymentAmount = Number(e.target.value) || 0) })])));
      else detail.appendChild(h("div.flex.between.wrap", { style: { gap: "10px" } }, [h("span.pill.red", t("noProvider")), h("span.link", { onclick: () => ui.toast(t("nav.payments") + " — " + t("tipPayments")) }, t("manageProviders"))]));
    }
    const tr = toggleRow(w, "acceptPayments", t("acceptPayments"), { _onToggle: paint });
    paint();
    return panelCard("paymentsTitle", "paymentsSub2", h("div", [tr, detail]));
  }

  // ---------- TAB: Notifications & policies ----------
  function notificationsTab(w) {
    const MIN = ["minutes", "hours"];
    return h("div", [
      panelCard("notifTitle", "notifSub2", h("div.flex", { style: { gap: "10px" } }, [
        h("strong", { style: { alignSelf: "center" } }, t("statusLabels") + ":"),
        h("button.btn.btn-sm" + (w.statusLabels ? ".btn-primary" : ""), { onclick: (e) => { w.statusLabels = true; window.CRM.app.rerender(); } }, t("enabled")),
        h("button.btn.btn-sm" + (!w.statusLabels ? ".btn-primary" : ""), { onclick: (e) => { w.statusLabels = false; window.CRM.app.rerender(); } }, t("disabled")),
      ])),
      panelCard("additionalSettings", "additionalSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, [
        toggleRow(w, "assignContacts", t("assignContacts")),
        toggleRow(w, "skipAssign", t("skipAssign")),
        h("div.divider"),
        h("div.section-title", { style: { margin: 0 } }, t("cancelReschedulePolicy")),
        expirePolicy(w, "allowReschedule", "rescheduleExpireValue", "rescheduleExpireUnit", t("allowReschedule"), t("rescheduleExpire"), MIN),
        expirePolicy(w, "allowCancel", "cancelExpireValue", "cancelExpireUnit", t("allowCancel"), t("cancelExpire"), MIN),
      ])),
      panelCard("thirdParty", "thirdPartySub", h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } }, [
        toggleRow(w, "allowThirdParty", t("allowThirdParty")),
        field(t("inviteNotes"), ui.textarea(w.inviteNotes, { placeholder: "Phone:- {{contact.phone}}\nEmail:- {{contact.email}}", oninput: (e) => (w.inviteNotes = e.target.value) })),
      ])),
    ]);
  }
  function expirePolicy(w, toggleKey, vKey, uKey, label, expireLabel, units) {
    const sub = h("div.flex" + (w[toggleKey] ? "" : ".hidden"), { style: { gap: "8px", marginLeft: "48px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" } }, [
      h("span.faint", { style: { fontSize: "13px" } }, expireLabel), numUnit(w, vKey, uKey, units), h("span.faint", { style: { fontSize: "13px" } }, t("beforeMeeting")),
    ]);
    const tr = toggleRow(w, toggleKey, label, { _onToggle: (on) => sub.classList.toggle("hidden", !on) });
    return h("div", [tr, sub]);
  }

  // ---------- TAB: Widget appearance ----------
  function widgetTab(w) {
    const neoBox = h("div.card.card-pad" + (w.widgetStyle === "neo" ? "" : ".hidden"), { style: { background: "var(--bg-sunken)", boxShadow: "none", marginTop: "14px" } }, [
      h("div.flex", { style: { gap: "8px", marginBottom: "12px" } }, [h("strong", t("customizeWidget")), h("span.pill.blue", { style: { fontSize: "11px" } }, t("neoOnly"))]),
      field(t("primaryColor"), colorField(w, "primaryColor")),
      field(t("backgroundColor"), colorField(w, "backgroundColor")),
      field(t("buttonText"), ui.input(w.buttonText, { placeholder: t("buttonTextDefault"), oninput: (e) => (w.buttonText = e.target.value) })),
      h("div.divider"),
      toggleRow(w, "showTitle", t("showTitle")),
      toggleRow(w, "showDescription", t("showDescription")),
      toggleRow(w, "showDetails", t("showDetails")),
    ]);
    const styleRadios = h("div.flex", { style: { gap: "18px" } }, [
      radio("widgetStyle", "neo", t("neo"), w, () => neoBox.classList.remove("hidden")),
      radio("widgetStyle", "classic", t("classic"), w, () => neoBox.classList.add("hidden")),
    ]);
    return panelCard("widgetTitle", "widgetSub", h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } }, [
      field(t("coverImage"), uploader(w, "coverImage", "coverHint")),
      h("div", [h("div.section-title", t("widgetStyle")), h("p.faint", { style: { fontSize: "12.5px", marginBottom: "10px" } }, t("widgetStyleSub")), styleRadios]),
      neoBox,
      field(t("customCode"), ui.textarea(w.customCode, { placeholder: t("customCodePh"), oninput: (e) => (w.customCode = e.target.value) })),
    ]));
  }

  const TABS = {
    basic: basicTab, staff: staffTab, availability: availabilityTab, rules: rulesTab,
    form: formTab, payments: paymentsTab, notifications: notificationsTab, widget: widgetTab,
  };

  window.CRM.views.calendar = { render };
})();
