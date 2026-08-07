/* ============================================================ Unified Conversation Inbox ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h, fullName } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  const CHANNELS = [
    { id: "email", ico: "✉️", color: "#2563eb", enabled: true },
    { id: "sms", ico: "💬", color: "#16a34a", enabled: true },
    { id: "whatsapp", ico: "🟢", color: "#25d366", enabled: false },
    { id: "instagram", ico: "📸", color: "#e1306c", enabled: false },
    { id: "messenger", ico: "💠", color: "#0084ff", enabled: false },
    { id: "webchat", ico: "🌐", color: "#6d5efc", enabled: false },
  ];
  const state = { activeId: null, channel: "email", mode: "reply" }; // mode: reply | note

  function render(root, params) {
    const store = S();
    if (params && params.id) state.activeId = params.id;

    // Threads = contacts with messages, plus (if selected via contact detail) the active contact
    let threads = store.contactsWithMessages();
    if (state.activeId && !threads.find((c) => c.id === state.activeId)) {
      const c = store.byId("contacts", state.activeId); if (c) threads = [c].concat(threads);
    }
    threads.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));

    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("inbox.title")), h("div.sub", t("inbox.sub"))]),
      h("div.spacer"),
      h("button.btn", { onclick: startConversation }, "＋ " + t("inbox.title")),
    ]));

    if (!threads.length) {
      root.appendChild(ui.empty("💬", t("inbox.noThreads"), t("inbox.noThreadsSub"),
        h("button.btn.btn-primary", { onclick: startConversation }, "＋ " + t("inbox.title"))));
      return;
    }

    if (!state.activeId || !threads.find((c) => c.id === state.activeId)) state.activeId = threads[0].id;
    const active = store.byId("contacts", state.activeId);

    const listEl = h("div.inbox-list", threads.map((c) => threadItem(c)));
    const threadEl = active ? threadView(active) : h("div", ui.empty("💬", t("inbox.selectThread"), t("inbox.selectThreadSub")));

    root.appendChild(h("div.inbox", [listEl, threadEl]));
  }

  function threadItem(c) {
    const store = S();
    const msgs = store.messagesForContact(c.id).filter((m) => !m.isInternalNote);
    const last = msgs[msgs.length - 1];
    const active = c.id === state.activeId;
    return h("div.inbox-item" + (active ? ".active" : ""), { onclick: () => { state.activeId = c.id; window.CRM.app.rerender(); } }, [
      ui.avatar(fullName(c)),
      h("div", { style: { minWidth: 0, flex: 1 } }, [
        h("div.flex.between", [h("span", { style: { fontWeight: 600 } }, fullName(c)), h("span.faint", { style: { fontSize: "11px" } }, last ? ui.relTime(last.createdAt) : "")]),
        h("div.faint", { style: { fontSize: "12.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, last ? (last.direction === "out" ? "→ " : "") + last.body : "—"),
        last ? h("span.tag", { style: { marginTop: "4px", fontSize: "10.5px" } }, t("channels." + last.channel)) : null,
      ]),
    ]);
  }

  function threadView(c) {
    const store = S();
    const msgs = store.messagesForContact(c.id);
    const owner = store.member(c.ownerId);

    const bodyEl = h("div.thread-body", msgs.length ? msgs.map((m) => msgBubble(m)) : [h("p.faint", { style: { textAlign: "center", margin: "auto" } }, t("contacts.noHistory"))]);
    setTimeout(() => (bodyEl.scrollTop = bodyEl.scrollHeight), 0);

    const composer = buildComposer(c, bodyEl);

    return h("div.inbox-thread", [
      h("div.thread-head", [
        ui.avatar(fullName(c)),
        h("div", { style: { flex: 1 } }, [h("div", { style: { fontWeight: 700 } }, fullName(c)), h("div.faint", { style: { fontSize: "12px" } }, c.email || c.phone || "")]),
        h("div.flex", { style: { gap: "8px" } }, [
          h("span.faint", { style: { fontSize: "12px" } }, t("inbox.assignConversation") + ":"),
          ui.select(ui.memberOptions(), c.ownerId, (v) => { store.updateContact(c.id, { ownerId: v }); ui.toast(t("common.saved"), "success"); }, { style: "width:auto;padding:6px 10px" }),
          h("button.btn.btn-sm.btn-ghost", { onclick: () => (location.hash = "#/contacts/" + c.id) }, "👤"),
        ]),
      ]),
      bodyEl,
      composer,
    ]);
  }

  function msgBubble(m) {
    if (m.isInternalNote) {
      return h("div.msg.note", [m.body, h("div.msg-meta", ["🔒 " + t("inbox.internalNote"), " · ", ui.fmtDateTime(m.createdAt)])]);
    }
    const ch = CHANNELS.find((x) => x.id === m.channel) || CHANNELS[0];
    return h("div.msg." + (m.direction === "out" ? "out" : "in"), [
      m.body,
      h("div.msg-meta", [h("span.channel-ico", { style: { background: ch.color, width: "16px", height: "16px" } }, ""), t("channels." + m.channel), " · ", ui.fmtDateTime(m.createdAt)]),
    ]);
  }

  function buildComposer(c, bodyEl) {
    const store = S();
    const chTabs = h("div.channel-tabs", CHANNELS.map((ch) =>
      h("button.channel-tab" + (state.channel === ch.id ? ".active" : "") + (ch.enabled ? "" : ".disabled"),
        { onclick: () => { if (!ch.enabled) { ui.toast(t("channels." + ch.id) + " — " + t("scheduling.placeholder"), "error"); return; } state.channel = ch.id; state.mode = "reply"; refreshComposer(); } },
        [ch.ico, t("channels." + ch.id)])));

    const noteTab = h("button.channel-tab" + (state.mode === "note" ? ".active" : ""), { style: { borderColor: "var(--amber)", color: state.mode === "note" ? "#fff" : "var(--amber)", background: state.mode === "note" ? "var(--amber)" : "" }, onclick: () => { state.mode = "note"; refreshComposer(); } }, ["🔒", t("inbox.internalNote")]);

    const ta = h("textarea.textarea", { style: { minHeight: "56px", flex: 1 }, placeholder: state.mode === "note" ? t("inbox.typeNote") : t("inbox.typeMessage") });

    // quick replies
    const templates = [t("inbox.template1", { name: c.firstName || fullName(c) }), t("inbox.template2"), t("inbox.template3")];
    const quick = h("div.flex.wrap", { style: { gap: "6px" } }, templates.map((tpl) =>
      h("button.btn.btn-sm.btn-ghost", { style: { fontSize: "11.5px", background: "var(--bg-sunken)" }, onclick: () => { ta.value = tpl; ta.focus(); } }, tpl.length > 42 ? tpl.slice(0, 42) + "…" : tpl)));

    const send = h("button.btn.btn-primary", { onclick: () => {
      const text = ta.value.trim(); if (!text) return;
      store.addMessage({ contactId: c.id, channel: state.channel, direction: "out", body: text, isInternalNote: state.mode === "note" });
      ta.value = "";
      // re-render just the body + list ordering
      window.CRM.app.rerender();
    } }, state.mode === "note" ? t("contacts.addNote") : t("inbox.send"));

    const wrap = h("div.composer", [
      h("div.flex.between.wrap", { style: { gap: "8px" } }, [chTabs, noteTab]),
      h("details", { style: { fontSize: "12px" } }, [h("summary.muted", { style: { cursor: "pointer" } }, "💡 " + t("inbox.quickReplies")), h("div.mt-8", quick)]),
      h("div.composer-row", [ta, send]),
    ]);

    function refreshComposer() {
      const parent = wrap.parentNode; if (!parent) return;
      const fresh = buildComposer(c, bodyEl);
      fresh.querySelector("textarea").value = ta.value;
      parent.replaceChild(fresh, wrap);
    }
    return wrap;
  }

  function startConversation() {
    const store = S();
    if (!store.data.contacts.length) { ui.toast(t("contacts.noContacts"), "error"); location.hash = "#/contacts"; return; }
    let contactId = store.data.contacts[0].id;
    const m = ui.modal({ title: t("inbox.title"), icon: "💬" });
    m.setBody(h("div.field", [h("label", t("common.name")), ui.select(ui.contactOptions(false), contactId, (v) => (contactId = v))]));
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => { state.activeId = contactId; m.close(); window.CRM.app.rerender(); } }, t("common.confirm"))]);
  }

  window.CRM.views.inbox = { render };
})();
