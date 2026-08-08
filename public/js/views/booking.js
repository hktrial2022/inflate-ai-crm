/* ============================================================
   Public Booking Widget — the real, shareable page behind a
   calendar's link (#/book/<slug>). No login required.
   Renders from the calendar config, collects the form, and
   writes a contact + appointment to the store.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t("book." + k, v);
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function render(root, params) {
    const store = S();
    ui.clear(root);
    const shell = h("div.book-shell");
    root.appendChild(shell);

    const local = (store.data.calendars || []).find((c) => c.slug === params.slug);
    if (local) { renderCalendar(root, shell, params, local); return; }

    // Not cached on this device — try Supabase so the link works for anyone.
    shell.appendChild(h("div.book-card", h("div.book-empty", [h("div.spinner"), h("p.muted", "…")])));
    if (window.CRM.cloud && window.CRM.cloudReady) {
      window.CRM.cloud.fetchCalendarBySlug(params.slug).then((remote) => {
        if (!remote) { renderNotFound(shell, root, params); return; }
        (remote.memberIds || []).forEach((id) => { if (!store.byId("team", id)) store.data.team.push({ id: id, name: "Team", color: "#6d5efc" }); });
        window.CRM.cloud.fetchTeam().then((team) => {
          team.forEach((rt) => { const existing = store.byId("team", rt.id); if (existing) Object.assign(existing, rt); else store.data.team.push(rt); });
          renderCalendar(root, shell, params, remote, true);
        }).catch(() => renderCalendar(root, shell, params, remote, true));
      }).catch(() => renderNotFound(shell, root, params));
    } else {
      renderNotFound(shell, root, params);
    }
  }

  function renderNotFound(shell, root, params) {
    ui.clear(shell);
    shell.appendChild(h("div.book-card", [
      langBtn(() => render(root, params)),
      h("div.book-empty", [
        h("div", { style: { fontSize: "40px" } }, "🔗"),
        h("h2", t("notFound")), h("p.muted", t("notFoundSub")),
        h("div.book-note", "ℹ️ " + t("localNote")),
      ]),
    ]));
  }

  function renderCalendar(root, shell, params, cal, isRemote) {
    const store = S();
    ui.clear(shell);
    const accent = cal.primaryColor || cal.color || "#6d5efc";
    const type = window.CRM.settingsHelpers ? window.CRM.settingsHelpers.calType(cal.type) : { multi: false };
    const hosts = (cal.memberIds || []).map((id) => store.member(id)).filter(Boolean);
    const now = new Date();

    const state = { step: "datetime", month: new Date(now.getFullYear(), now.getMonth(), 1), selDate: null, selSlot: null,
      form: { name: "", email: "", phone: "", notes: "", consent: !cal.consent } };

    const card = h("div.book-card");
    shell.appendChild(card);
    shell.appendChild(h("div.book-powered", [t("poweredBy") + " ", h("strong", "Marco"), " 🧭"]));

    function header() {
      return h("div.book-head", { style: { borderTopColor: accent } }, [
        h("div.flex.between", [
          cal.logo ? h("img.book-logo", { src: cal.logo }) : h("div.book-logo-fallback", { style: { background: accent } }, "IA"),
          langBtn(rerender),
        ]),
        (cal.showTitle !== false) ? h("h1.book-title", cal.name) : null,
        (cal.showDescription !== false && cal.description) ? h("p.book-desc", cal.description) : null,
        (cal.showDetails !== false) ? h("div.book-meta", [
          h("span", "⏱️ " + (cal.durationValue || 30) + " " + t("minutes")),
          hosts.length ? h("span.flex", { style: { gap: "6px" } }, [
            h("div.avatar-stack", hosts.slice(0, 4).map((m) => ui.avatar(m, "sm"))),
            h("span", t("with") + " " + hosts.map((m) => m.name).join(", ")),
          ]) : null,
          locationLabel(cal),
        ]) : null,
      ]);
    }

    function rerender() { render(root, params); }

    function renderStep() {
      ui.clear(card);
      card.appendChild(header());
      if (state.step === "datetime") card.appendChild(datetimeStep());
      else if (state.step === "form") card.appendChild(formStep());
      else card.appendChild(doneStep());
    }

    // ---------- Step 1: date & time ----------
    function datetimeStep() {
      const wrap = h("div.book-body");
      wrap.appendChild(h("div.book-section-title", t("selectDate")));
      wrap.appendChild(monthHeader());
      wrap.appendChild(calendarGrid());
      if (state.selDate) {
        wrap.appendChild(h("div.book-section-title", { style: { marginTop: "18px" } }, t("selectTime")));
        wrap.appendChild(slotsGrid());
      }
      return wrap;
    }

    function monthHeader() {
      const m = state.month;
      const label = m.toLocaleDateString(lang() === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric" });
      const minMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const canPrev = m > minMonth;
      return h("div.flex.between.mb-16", [
        h("button.icon-btn", { disabled: !canPrev, onclick: () => { if (!canPrev) return; state.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); state.selDate = null; renderStep(); } }, "‹"),
        h("strong", { style: { textTransform: "capitalize" } }, label),
        h("button.icon-btn", { onclick: () => { state.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); state.selDate = null; renderStep(); } }, "›"),
      ]);
    }

    function calendarGrid() {
      const m = state.month;
      const first = new Date(m.getFullYear(), m.getMonth(), 1);
      const startDow = (first.getDay() + 6) % 7; // Monday-first
      const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today); maxDate.setDate(today.getDate() + (Number(cal.dateRangeValue) || 30));
      const dow = lang() === "es" ? ["L", "M", "X", "J", "V", "S", "D"] : ["M", "T", "W", "T", "F", "S", "S"];
      const cells = [];
      dow.forEach((d) => cells.push(h("div.faint", { style: { textAlign: "center", fontSize: "11px", fontWeight: 700, padding: "4px" } }, d)));
      for (let i = 0; i < startDow; i++) cells.push(h("div"));
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(m.getFullYear(), m.getMonth(), day);
        const bh = (cal.businessHours || {})[DAYS[date.getDay()]];
        const avail = date >= today && date <= maxDate && bh && bh.enabled;
        const sel = state.selDate && date.toDateString() === state.selDate.toDateString();
        cells.push(h("div.cal-day" + (avail ? ".avail" : ".muted") + (sel ? ".sel" : ""),
          { style: avail ? { borderColor: accent, color: sel ? "#fff" : accent, background: sel ? accent : "" } : {},
            onclick: avail ? () => { state.selDate = date; state.selSlot = null; renderStep(); } : null }, String(day)));
      }
      return h("div.cal-grid", cells);
    }

    function slotsGrid() {
      const bh = (cal.businessHours || {})[DAYS[state.selDate.getDay()]];
      if (!bh || !bh.enabled) return h("p.faint", t("noSlots"));
      const step = Number(cal.intervalValue) || 30;
      const dur = (cal.durationUnit === "hours" ? (cal.durationValue || 1) * 60 : (cal.durationValue || 30));
      const minNoticeMs = ((cal.minNoticeUnit === "hours" ? (cal.minNoticeValue || 0) : (cal.minNoticeValue || 0) * 24)) * 3600000;
      const earliest = new Date(now.getTime() + minNoticeMs);
      const [fh, fm] = bh.from.split(":").map(Number);
      const [th, tm] = bh.to.split(":").map(Number);
      const startMin = fh * 60 + fm, endMin = th * 60 + tm;
      const slots = [];
      for (let mnt = startMin; mnt + dur <= endMin; mnt += step) {
        const d = new Date(state.selDate); d.setHours(Math.floor(mnt / 60), mnt % 60, 0, 0);
        if (d < earliest) continue;
        slots.push(d);
      }
      if (!slots.length) return h("p.faint", t("noSlots"));
      return h("div.slots", slots.map((d) => {
        const label = d.toLocaleTimeString(lang() === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" });
        const sel = state.selSlot && state.selSlot.getTime() === d.getTime();
        return h("div.slot" + (sel ? ".sel" : ""), { style: sel ? { borderColor: accent, color: accent, background: accent + "14" } : {},
          onclick: () => { state.selSlot = d; state.step = "form"; renderStep(); } }, label);
      }));
    }

    // ---------- Step 2: form ----------
    function formStep() {
      const f = state.form;
      const consentRow = cal.consent ? h("label.flex", { style: { gap: "10px", alignItems: "flex-start", fontSize: "13px" } }, [
        h("input", { type: "checkbox", checked: f.consent, onchange: (e) => (f.consent = e.target.checked) }),
        h("span", cal.consentText || window.CRM.i18n.t("caledit.consentText")),
      ]) : null;

      const err = h("div.book-note.hidden", { style: { background: "var(--red-bg)", color: "var(--red)", borderColor: "transparent" } });

      const summary = h("div.book-summary", { style: { borderColor: accent } }, [
        h("strong", cal.name), h("div.muted", "📅 " + state.selSlot.toLocaleDateString(lang() === "es" ? "es-MX" : "en-US", { weekday: "long", month: "long", day: "numeric" }) +
          " · " + state.selSlot.toLocaleTimeString(lang() === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" })),
        h("span.link", { onclick: () => { state.step = "datetime"; renderStep(); } }, "✎ " + t("change")),
      ]);

      const body = h("div.book-body", [
        summary,
        h("div.book-section-title", t("yourDetails")),
        field(t("name") + " *", ui.input(f.name, { oninput: (e) => (f.name = e.target.value) })),
        field(t("email") + " *", ui.input(f.email, { type: "email", oninput: (e) => (f.email = e.target.value) })),
        field(t("phone"), ui.input(f.phone, { oninput: (e) => (f.phone = e.target.value) })),
        field(t("notes"), ui.textarea(f.notes, { oninput: (e) => (f.notes = e.target.value) })),
        consentRow,
        cal.acceptPayments && cal.paymentAmount ? h("div.book-note", "💳 " + t("payNote", { amount: ui.currency(cal.paymentAmount) })) : null,
        err,
        h("div.flex", { style: { gap: "10px", marginTop: "8px" } }, [
          h("button.btn", { onclick: () => { state.step = "datetime"; renderStep(); } }, "← " + t("back")),
          h("button.btn.btn-primary", { style: { flex: 1, background: accent, border: "none" }, onclick: submit }, t("confirm")),
        ]),
      ]);

      function submit() {
        err.classList.add("hidden");
        if (!f.name.trim() || !/.+@.+\..+/.test(f.email)) { err.textContent = t("required"); err.classList.remove("hidden"); return; }
        if (cal.consent && !f.consent) { err.textContent = t("consentRequired"); err.classList.remove("hidden"); return; }
        doBooking(cal, state, f);
        state.step = "done"; renderStep();
      }
      return body;
    }

    // ---------- Step 3: done ----------
    function doneStep() {
      const msg = (cal.confirmType === "redirect" && cal.redirectUrl) ? null : (cal.thankYouMsg || t("confirmedSub"));
      if (cal.confirmType === "redirect" && cal.redirectUrl) {
        try { window.location.href = /^https?:/.test(cal.redirectUrl) ? cal.redirectUrl : "https://" + cal.redirectUrl; } catch (e) {}
      }
      return h("div.book-body.book-done", [
        h("div.book-check", { style: { background: accent } }, "✓"),
        h("h2", t("confirmedTitle")),
        h("p.muted", msg),
        h("div.book-summary", { style: { borderColor: accent, textAlign: "left" } }, [
          h("strong", cal.name),
          h("div.muted", "📅 " + state.selSlot.toLocaleDateString(lang() === "es" ? "es-MX" : "en-US", { weekday: "long", month: "long", day: "numeric" }) +
            " · " + state.selSlot.toLocaleTimeString(lang() === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" })),
        ]),
        h("button.btn", { onclick: () => { state.step = "datetime"; state.selDate = null; state.selSlot = null; state.form = { name: "", email: "", phone: "", notes: "", consent: !cal.consent }; renderStep(); } }, t("bookAnother")),
      ]);
    }

    renderStep();
  }

  // Persist the booking: find/create contact, assign host, create appointment + activity.
  // Writes locally (instant UI, works for the agency's own device) AND, when
  // Supabase is wired, straight to the cloud — this is what makes the link
  // work for a client booking from their own phone/computer.
  function doBooking(cal, state, f) {
    const store = S();
    const email = f.email.trim().toLowerCase();
    let contact = store.data.contacts.find((c) => (c.email || "").toLowerCase() === email);
    const parts = f.name.trim().split(/\s+/);
    if (!contact) {
      contact = store.addContact({ firstName: parts[0] || f.name, lastName: parts.slice(1).join(" "), email: f.email.trim(), phone: f.phone, source: "website", notes: f.notes, tags: ["booking"] });
    }
    // host assignment by calendar type
    const members = cal.memberIds || [];
    let ownerId = members[0] || null;
    if (cal.type === "round_robin" && members.length) {
      const count = store.data.appointments.length;
      ownerId = members[count % members.length];
    }
    const durationMin = cal.durationUnit === "hours" ? (cal.durationValue || 1) * 60 : (cal.durationValue || 30);
    store.addAppointment({ contactId: contact.id, ownerId: ownerId, type: cal.name, startAt: state.selSlot.toISOString(), durationMin: durationMin });
    store.addActivity({ contactId: contact.id, type: "meeting", title: cal.name + " · " + state.selSlot.toLocaleString(), dueAt: state.selSlot.toISOString() });
    if (f.notes) store.addMessage({ contactId: contact.id, channel: "webchat", direction: "in", body: f.notes });

    // Visitors booking from a public link are never signed in, so there's
    // no account_id to infer from a session — it has to come from the
    // calendar itself (whichever sub-account owns it).
    const accountId = cal.accountId;
    if (window.CRM.cloud && window.CRM.cloudReady && accountId) {
      (async () => {
        try {
          let remoteContact = await window.CRM.cloud.findContactByEmail(f.email.trim());
          if (!remoteContact) remoteContact = await window.CRM.cloud.insertContact({ accountId, firstName: parts[0] || f.name, lastName: parts.slice(1).join(" "), email: f.email.trim(), phone: f.phone, source: "website", notes: f.notes, tags: ["booking"] });
          await window.CRM.cloud.insertAppointment({ accountId, contactId: remoteContact.id, ownerId: /^[0-9a-f-]{36}$/i.test(ownerId || "") ? ownerId : null, type: cal.name, startAt: state.selSlot.toISOString(), durationMin: durationMin });
          await window.CRM.cloud.insertActivity({ accountId, contactId: remoteContact.id, type: "meeting", title: cal.name + " · " + state.selSlot.toLocaleString(), dueAt: state.selSlot.toISOString() });
        } catch (e) { console.warn("[booking] cloud write failed", e.message || e); }
      })();
    }
  }

  function locationLabel(cal) {
    const map = { zoom: "🎥 Zoom", google: "🎥 Google Meet", phone: "📞 " + (cal.locationCustom || "Phone"), inperson: "📍 " + (cal.locationCustom || "In person"), custom: cal.locationCustom ? "📍 " + cal.locationCustom : null };
    const label = map[cal.location || "custom"];
    return label ? h("span", label) : null;
  }
  function field(label, control) { return h("div.field", [h("label", label), control]); }
  function lang() { return window.CRM.i18n.getLang(); }
  function langBtn(after) {
    return h("button.book-lang", { onclick: () => { window.CRM.i18n.setLang(lang() === "en" ? "es" : "en"); after && after(); } }, lang() === "en" ? "🇲🇽 ES" : "🇺🇸 EN");
  }

  window.CRM.views.booking = { render };
})();
