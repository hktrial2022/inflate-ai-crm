/* ============================================================ Appointment Scheduling ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h, fullName } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "13:00", "13:30", "14:00", "15:00", "16:00"];
  const state = { selDate: null, selSlot: null, month: null };

  function render(root) {
    const store = S();
    const now = new Date();
    if (!state.month) state.month = new Date(now.getFullYear(), now.getMonth(), 1);

    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("scheduling.title")), h("div.sub", t("scheduling.sub"))]),
      h("div.spacer"),
      h("span.pill.blue", "🔁 " + t("scheduling.roundRobin")),
    ]));

    // Booking calendars configured in Settings (the link source shared with clients)
    root.appendChild(bookingCalendarsCard());

    const left = h("div.card.card-pad", [
      h("h3.mb-16", { style: { fontSize: "15px" } }, "📅 " + t("scheduling.bookingPage")),
      monthHeader(),
      calendar(),
      state.selDate ? h("div.mt-16", [h("div.section-title", t("scheduling.pickTime")), slotGrid()]) : h("p.faint.mt-16", t("scheduling.pickDate")),
      state.selDate && state.selSlot ? h("button.btn.btn-primary.mt-16", { style: { width: "100%" }, onclick: () => confirmBooking() }, "✓ " + t("scheduling.book")) : null,
    ]);

    const right = h("div", [
      integrationsCard(),
      upcomingCard(),
    ]);

    root.appendChild(h("div.detail-grid", [left, right]));
  }

  function bookingCalendarsCard() {
    const store = S();
    const cals = store.data.calendars || [];
    const helpers = window.CRM.settingsHelpers || {};
    return h("div.card.card-pad.mb-16", [
      h("div.flex.between.mb-8", [
        h("h3", { style: { fontSize: "15px" } }, "🔗 " + t("scheduling.bookingCalendars")),
        h("button.btn.btn-sm", { onclick: () => (location.hash = "#/settings") }, "⚙️ " + t("nav.settings")),
      ]),
      h("p.faint.mb-16", { style: { fontSize: "12.5px" } }, t("scheduling.calendarsSub")),
      cals.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, cals.map((c) => {
        const type = helpers.calType ? helpers.calType(c.type) : { ico: "📅" };
        const url = helpers.bookingUrl ? helpers.bookingUrl(c) : (location.origin + location.pathname + "#/book/" + c.slug);
        const members = (c.memberIds || []).map((id) => store.member(id)).filter(Boolean);
        return h("div.flex.between", { style: { padding: "12px", background: "var(--bg-sunken)", borderRadius: "10px", gap: "10px", flexWrap: "wrap" } }, [
          h("div.flex", { style: { gap: "11px", minWidth: 0 } }, [
            h("div.avatar", { style: { background: c.color || "var(--brand-1)", borderRadius: "10px" } }, type.ico || "📅"),
            h("div", { style: { minWidth: 0 } }, [
              h("strong", c.name),
              h("div.faint", { style: { fontSize: "12px" } }, "🔗 …/#/book/" + c.slug + " · " + (c.durationValue || 30) + " " + t("scheduling.minutes")),
            ]),
          ]),
          h("div.flex", { style: { gap: "6px" } }, [
            members.length ? h("div.avatar-stack", members.slice(0, 4).map((m) => ui.avatar(m, "sm"))) : null,
            h("button.btn.btn-sm.btn-ghost", { title: t("scheduling.copyLink"), onclick: () => { try { navigator.clipboard.writeText(url); ui.toast(t("calendars.copied"), "success"); } catch (e) { ui.toast(url); } } }, "🔗"),
            h("button.btn.btn-sm.btn-ghost", { title: t("scheduling.preview"), onclick: () => window.open(url, "_blank") }, "👁️"),
            h("button.btn.btn-sm.btn-ghost", { title: t("scheduling.manage"), onclick: () => (location.hash = "#/calendar/" + c.id) }, "⚙️"),
          ]),
        ]);
      })) : h("div.flex", { style: { gap: "10px", alignItems: "center" } }, [
        h("span.faint", t("scheduling.noCalendarsYet")),
        h("button.btn.btn-sm.btn-primary", { onclick: () => (location.hash = "#/settings") }, "＋ " + t("scheduling.createCalendar")),
      ]),
    ]);
  }

  function monthHeader() {
    const m = state.month;
    const label = m.toLocaleDateString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric" });
    return h("div.flex.between.mb-16", [
      h("button.btn.btn-sm.btn-ghost", { onclick: () => { state.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); state.selDate = null; window.CRM.app.rerender(); } }, "‹"),
      h("strong", { style: { textTransform: "capitalize" } }, label),
      h("button.btn.btn-sm.btn-ghost", { onclick: () => { state.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); state.selDate = null; window.CRM.app.rerender(); } }, "›"),
    ]);
  }

  function calendar() {
    const m = state.month;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7; // Mon-first
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = window.CRM.i18n.getLang() === "es" ? ["L", "M", "X", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];
    const cells = [];
    dow.forEach((d) => cells.push(h("div.faint", { style: { textAlign: "center", fontSize: "11px", fontWeight: 700, padding: "4px" } }, d)));
    for (let i = 0; i < startDow; i++) cells.push(h("div"));
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(m.getFullYear(), m.getMonth(), day);
      const isWeekend = [0, 6].includes(date.getDay());
      const past = date < today;
      const avail = !past && !isWeekend;
      const sel = state.selDate && date.toDateString() === state.selDate.toDateString();
      cells.push(h("div.cal-day" + (avail ? ".avail" : ".muted") + (sel ? ".sel" : ""),
        { onclick: avail ? () => { state.selDate = date; state.selSlot = null; window.CRM.app.rerender(); } : null }, String(day)));
    }
    return h("div.cal-grid", cells);
  }

  function slotGrid() {
    return h("div.slots", SLOTS.map((s) => h("div.slot" + (state.selSlot === s ? ".sel" : ""), { onclick: () => { state.selSlot = s; window.CRM.app.rerender(); } }, s)));
  }

  function confirmBooking() {
    const store = S();
    if (!store.data.contacts.length) { ui.toast(t("contacts.noContacts"), "error"); return; }
    let contactId = store.data.contacts[0].id;
    let type = "Discovery Call", duration = 30;
    const ownerId = store.nextRoundRobinOwner();
    const owner = store.member(ownerId);

    const m = ui.modal({ title: t("scheduling.confirmBooking"), icon: "📅" });
    m.setBody(h("div.form-grid", [
      ui.field(t("scheduling.selectContact"), ui.select(ui.contactOptions(false), contactId, (v) => (contactId = v)), { full: true }),
      ui.field(t("scheduling.meetingType"), ui.input(type, { oninput: (e) => (type = e.target.value) })),
      ui.field(t("scheduling.duration") + " (" + t("scheduling.minutes") + ")", ui.select([15, 30, 45, 60].map((n) => ({ value: n, label: n })), 30, (v) => (duration = Number(v)))),
      ui.field("", h("div.card.card-pad", { style: { background: "var(--bg-sunken)", boxShadow: "none" } }, [
        h("div.flex", { style: { gap: "10px" } }, [owner ? ui.avatar(owner) : null, h("div", [h("div.faint", { style: { fontSize: "12px" } }, t("scheduling.assignedVia")), h("strong", owner ? owner.name : "—")])]),
        h("div.mt-8.faint", { style: { fontSize: "12.5px" } }, "📅 " + fmtSel() + " · " + state.selSlot),
      ]), { full: true }),
    ]));
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => {
        const [hh, mm] = state.selSlot.split(":").map(Number);
        const start = new Date(state.selDate); start.setHours(hh, mm, 0, 0);
        store.addAppointment({ contactId, ownerId, type, startAt: start.toISOString(), durationMin: duration });
        store.addActivity({ contactId, type: "meeting", title: type + " · " + state.selSlot, dueAt: start.toISOString() });
        ui.toast(t("scheduling.book") + " ✓", "success");
        state.selDate = null; state.selSlot = null; m.close(); window.CRM.app.rerender();
      } }, "✓ " + t("scheduling.book"))]);
  }
  function fmtSel() { return state.selDate ? state.selDate.toLocaleDateString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { weekday: "short", month: "short", day: "numeric" }) : ""; }

  function integrationsCard() {
    return h("div.card.card-pad.mb-16", [
      h("h3.mb-16", { style: { fontSize: "15px" } }, "🔗 " + t("scheduling.calSync")),
      h("div.flex", { style: { gap: "10px", flexWrap: "wrap" } }, [
        h("button.btn", { onclick: () => ui.toast(t("scheduling.placeholder"), "error") }, "📅 " + t("scheduling.connectGoogle")),
        h("button.btn", { onclick: () => ui.toast(t("scheduling.placeholder"), "error") }, "📆 " + t("scheduling.connectOutlook")),
      ]),
      h("div.divider"),
      h("div.section-title", t("scheduling.reminders")),
      h("label.flex.mb-8", { style: { gap: "8px" } }, [h("input", { type: "checkbox", checked: true }), "💬 " + t("scheduling.smsReminder")]),
      h("label.flex", { style: { gap: "8px" } }, [h("input", { type: "checkbox", checked: true }), "✉️ " + t("scheduling.emailReminder")]),
      h("div.mt-8.faint", { style: { fontSize: "12px" } }, t("scheduling.reminderBefore") + ": 24h · 1h " + t("scheduling.placeholder")),
    ]);
  }

  function upcomingCard() {
    const store = S();
    const appts = store.data.appointments.slice().sort((a, b) => new Date(a.startAt) - new Date(b.startAt)).filter((a) => new Date(a.startAt) >= new Date(Date.now() - 86400000));
    return h("div.card.card-pad", [
      h("h3.mb-16", { style: { fontSize: "15px" } }, "🗓️ " + t("scheduling.upcoming")),
      appts.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, appts.map((a) => apptRow(a))) : h("p.faint", t("scheduling.noAppointmentsSub")),
    ]);
  }
  function apptRow(a) {
    const store = S();
    const c = store.byId("contacts", a.contactId);
    const owner = store.member(a.ownerId);
    return h("div.flex.between", { style: { padding: "12px", background: "var(--bg-sunken)", borderRadius: "10px" } }, [
      h("div.flex", { style: { gap: "10px" } }, [
        h("div.avatar", { style: { background: "var(--brand-grad)", flexDirection: "column", lineHeight: 1 } }, [
          h("span", { style: { fontSize: "9px" } }, new Date(a.startAt).toLocaleDateString(undefined, { month: "short" })),
          h("span", { style: { fontSize: "14px" } }, String(new Date(a.startAt).getDate())),
        ]),
        h("div", [h("strong", a.type), h("div.faint", { style: { fontSize: "12.5px" } }, ui.fmtDateTime(a.startAt) + " · " + a.durationMin + t("scheduling.minutes"))]),
      ]),
      h("div.flex", { style: { gap: "8px" } }, [
        c ? h("span.tag", "👤 " + fullName(c)) : null,
        owner ? ui.avatar(owner, "sm") : null,
        h("button.btn.btn-sm.btn-ghost", { onclick: () => { store.deleteAppointment(a.id); window.CRM.app.rerender(); } }, "🗑️"),
      ]),
    ]);
  }

  window.CRM.views.scheduling = { render };
})();
