/* ============================================================
   Marco — panel de diagnóstico agéntico. Conversación con Marco
   (edge function marco-chat) + panel de decisiones/acciones
   propuestas que requieren aprobación humana explícita antes de
   cualquier cosa. Reutiliza el patrón visual de inbox.js.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const t = (k, v) => window.CRM.i18n.t("marco." + k, v);

  const state = { cases: [], activeCaseId: null, messages: [], decisions: [], actions: [], loaded: false, sending: false, pendingImage: null };
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

  function render(root, params) {
    const cloud = window.CRM.cloud;
    if (!cloud || !window.CRM.cloudReady) {
      root.appendChild(ui.empty("🧭", t("title"), "Connect Supabase to talk to Marco."));
      return;
    }
    // Wrapped in .inbox-page so .inbox can fill the remaining height via
    // flex instead of guessing this header's height with a vh calc.
    const page = h("div.inbox-page", [h("div.view-head", [
      h("div", [h("h1", t("title")), h("div.sub", t("sub"))]),
      h("div.spacer"),
      h("button.btn", { onclick: newCase }, "＋ " + t("newCase")),
    ])]);
    root.appendChild(page);

    if (!state.loaded) {
      const body = h("div", h("p.faint", "Loading…"));
      page.appendChild(body);
      loadAll(body);
      return;
    }

    const listEl = h("div.inbox-list", state.cases.length
      ? state.cases.map((c) => caseItem(c))
      : [h("p.faint", { style: { padding: "16px" } }, t("noCasesYet"))]);

    page.appendChild(h("div.inbox", [listEl, conversationPane()]));
  }

  async function loadAll(body) {
    const cloud = window.CRM.cloud;
    try {
      state.cases = await cloud.marco.fetchCases();
      if (!state.activeCaseId && state.cases.length) state.activeCaseId = state.cases[0].id;
      await refreshCaseData();
      state.loaded = true;
      window.CRM.app.rerender();
    } catch (e) {
      ui.clear(body);
      body.appendChild(h("p", "⚠️ " + (e.message || e)));
    }
  }

  async function refreshCaseData() {
    const cloud = window.CRM.cloud;
    if (!state.activeCaseId) { state.messages = []; state.decisions = []; state.actions = []; return; }
    const [messages, decisions, actions] = await Promise.all([
      cloud.marco.fetchMessages(state.activeCaseId),
      cloud.marco.listDecisions(),
      cloud.marco.listActions(),
    ]);
    state.messages = messages;
    state.decisions = decisions.filter((d) => d.case_id === state.activeCaseId);
    state.actions = actions.filter((a) => a.case_id === state.activeCaseId);
  }

  function caseItem(c) {
    const active = c.id === state.activeCaseId;
    return h("div.inbox-item" + (active ? ".active" : ""), { onclick: () => selectCase(c.id) }, [
      ui.avatar(c.title || "Marco"),
      h("div", { style: { minWidth: 0, flex: 1 } }, [
        h("div.flex.between", [h("span", { style: { fontWeight: 600 } }, c.title || t("newCase")), h("span.faint", { style: { fontSize: "11px" } }, ui.relTime(c.created_at))]),
        h("div.faint", { style: { fontSize: "12.5px" } }, c.status === "closed" ? t("closed") : t("open")),
      ]),
    ]);
  }

  function selectCase(id) {
    state.activeCaseId = id;
    refreshCaseData().then(() => window.CRM.app.rerender());
  }

  function newCase() {
    state.activeCaseId = null;
    state.messages = []; state.decisions = []; state.actions = [];
    window.CRM.app.rerender();
  }

  function conversationPane() {
    const bodyEl = h("div.thread-body", state.messages.length
      ? state.messages.map((m) => msgBubble(m))
      : [h("p.faint", { style: { textAlign: "center", margin: "auto" } }, t("startPrompt"))]);

    // Messages + the pending-approvals panel scroll together as one region
    // so the panel's length (can be long) never pushes the composer below
    // it — the composer has its own reserved, never-shrinking space.
    const scrollEl = h("div.thread-scroll", [bodyEl, pendingPanel()].filter(Boolean));
    setTimeout(() => (scrollEl.scrollTop = scrollEl.scrollHeight), 0);

    return h("div.inbox-thread", [
      scrollEl,
      buildComposer(),
    ]);
  }

  function msgBubble(m) {
    const bubble = h("div.msg." + (m.role === "user" ? "out" : "in"));
    if (m.image_url) bubble.appendChild(h("img.msg-image", { src: m.image_url }));
    const textEl = h("div");
    textEl.innerHTML = mdToHtml(m.content);
    bubble.appendChild(textEl);
    bubble.appendChild(h("div.msg-meta", [ui.fmtDateTime ? ui.fmtDateTime(m.created_at) : ui.relTime(m.created_at)]));
    return bubble;
  }

  // Minimal, safe markdown → HTML for Marco's replies: escapes the raw
  // text first (so nothing user/model-supplied can inject real tags),
  // then only ever introduces a fixed set of safe tags around that
  // escaped text. Supports **bold**, blank-line paragraphs, and "- "
  // bullet lists — the shapes Marco's system prompt actually produces.
  function mdToHtml(text) {
    const esc = String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return esc.split(/\n{2,}/).map((block) => {
      const lines = block.split("\n").filter((l) => l.trim().length);
      if (lines.length && lines.every((l) => /^[-*]\s+/.test(l))) {
        return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^[-*]\s+/, "")) + "</li>").join("") + "</ul>";
      }
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  function pendingPanel() {
    const pendingDecisions = state.decisions.filter((d) => d.status === "pending");
    const pendingActions = state.actions.filter((a) => a.status === "proposed");
    if (!pendingDecisions.length && !pendingActions.length) return null;

    return h("div.card.card-pad.mt-8", [
      h("div.section-title", t("pendingTitle")),
      ...pendingDecisions.map((d) => h("div.mt-8", { style: { borderLeft: "3px solid var(--amber)", paddingLeft: "10px" } }, [
        h("div", { style: { fontWeight: 600 } }, d.decision),
        h("div.faint", { style: { fontSize: "12.5px" } }, d.problem),
        d.due_date ? h("div.faint", { style: { fontSize: "11.5px" } }, t("dueDate") + ": " + d.due_date) : null,
        h("button.btn.btn-sm.btn-ghost.mt-8", { onclick: () => reviewDecision(d.id) }, t("markReviewed")),
      ])),
      ...pendingActions.map((a) => h("div.mt-8", { style: { borderLeft: "3px solid var(--brand, #6d5efc)", paddingLeft: "10px" } }, [
        h("div", { style: { fontWeight: 600 } }, a.action_type),
        h("div.faint", { style: { fontSize: "12.5px" } }, JSON.stringify(a.payload)),
        h("div.flex.mt-8", { style: { gap: "6px" } }, [
          h("button.btn.btn-sm.btn-primary", { onclick: () => approveAction(a.id) }, "✓ " + t("approve")),
          h("button.btn.btn-sm.btn-ghost", { onclick: () => rejectAction(a.id) }, "✕ " + t("reject")),
        ]),
      ])),
    ]);
  }

  function approveAction(id) {
    const me = window.CRM.store.currentUser();
    window.CRM.cloud.marco.approveAction(id, me && me.id).then(refreshCaseData).then(() => window.CRM.app.rerender());
  }
  function rejectAction(id) {
    window.CRM.cloud.marco.rejectAction(id).then(refreshCaseData).then(() => window.CRM.app.rerender());
  }
  function reviewDecision(id) {
    window.CRM.cloud.marco.reviewDecision(id).then(refreshCaseData).then(() => window.CRM.app.rerender());
  }

  function buildComposer() {
    const ta = h("textarea.textarea", { style: { minHeight: "56px", flex: 1 }, placeholder: t("typeMessage"), disabled: state.sending });
    const send = h("button.btn.btn-primary", { disabled: state.sending, onclick: () => sendMessage(ta) }, state.sending ? "…" : t("send"));
    // Enter sends (standard chat convention); Shift+Enter inserts a newline.
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(ta); }
    });

    const rowChildren = [buildMicButton(ta), buildAttachButton(), ta, send].filter(Boolean);
    return h("div.composer", [
      state.pendingImage ? attachmentPreview() : null,
      h("div.composer-row", rowChildren),
    ]);
  }

  function attachmentPreview() {
    return h("div.composer-attachment", [
      h("img", { src: state.pendingImage.dataUrl }),
      h("span", state.pendingImage.name || t("imageAttached")),
      h("span.remove", { onclick: () => { state.pendingImage = null; window.CRM.app.rerender(); } }, "✕"),
    ]);
  }

  function buildMicButton(ta) {
    if (!SpeechRecognitionCtor) return null; // not supported on this browser — no button, no broken promise
    const btn = h("button.btn.btn-ghost", { type: "button", title: t("voiceInput"), disabled: state.sending, style: { flexShrink: 0 } }, "🎤");
    let recognition = null;
    btn.addEventListener("click", () => {
      if (recognition) { recognition.stop(); return; }
      recognition = new SpeechRecognitionCtor();
      recognition.lang = window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { btn.classList.add("recording"); btn.textContent = "⏺"; };
      recognition.onerror = () => ui.toast(t("voiceError"), "error");
      recognition.onresult = (e) => {
        const transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ");
        ta.value = (ta.value ? ta.value.trim() + " " : "") + transcript;
        ta.focus();
      };
      recognition.onend = () => { recognition = null; btn.classList.remove("recording"); btn.textContent = "🎤"; };
      recognition.start();
    });
    return btn;
  }

  function buildAttachButton() {
    const input = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: (e) => handleImagePick(e.target.files[0]) });
    const btn = h("button.btn.btn-ghost", { type: "button", title: t("attachImage"), disabled: state.sending, style: { flexShrink: 0 }, onclick: () => input.click() }, "📎");
    return h("span", [btn, input]);
  }

  // Downscales client-side before it ever touches the network or a Claude
  // request — a phone photo can be 4000px+/several MB, and neither the
  // edge function payload nor Claude's vision input needs that fidelity.
  function handleImagePick(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        state.pendingImage = { dataUrl: canvas.toDataURL("image/jpeg", 0.75), name: file.name };
        window.CRM.app.rerender();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function sendMessage(ta) {
    const text = ta.value.trim();
    const image = state.pendingImage;
    if ((!text && !image) || state.sending) return;
    state.sending = true;
    window.CRM.app.rerender();
    // Claude with adaptive thinking + the propose_* tool loop can genuinely
    // take a while, but the send button must never get stuck disabled
    // forever if a request hangs — race it against a hard ceiling so
    // state.sending always gets released one way or another.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(t("timeoutError"))), 90000));
    Promise.race([window.CRM.cloud.marco.sendMessage(state.activeCaseId, text || t("imageAttached"), image), timeout])
      .then(async (res) => {
        state.activeCaseId = res.caseId;
        state.pendingImage = null;
        if (!state.cases.find((c) => c.id === res.caseId)) state.cases = await window.CRM.cloud.marco.fetchCases();
        await refreshCaseData();
      })
      .catch((e) => ui.toast(e.message || String(e), "error"))
      .finally(() => { state.sending = false; window.CRM.app.rerender(); });
  }

  window.CRM.views.marco = { render };
})();
