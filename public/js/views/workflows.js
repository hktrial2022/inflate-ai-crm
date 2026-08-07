/* ============================================================ Workflow Automation Builder ============================================================ */
(function () {
  window.CRM = window.CRM || {}; window.CRM.views = window.CRM.views || {};
  const ui = window.CRM.ui;
  const { h } = ui;
  const S = () => window.CRM.store;
  const t = (k, v) => window.CRM.i18n.t(k, v);

  const TRIGGERS = ["form_submitted", "tag_added", "appointment_booked", "payment_received", "deal_stage_changed"];
  const ACTIONS = ["send_email", "send_sms", "wait", "assign_task", "move_stage", "notify_team"];

  function render(root, params) {
    if (params && params.id) return renderBuilder(root, params.id);
    renderList(root);
  }

  function renderList(root) {
    const store = S();
    root.appendChild(h("div.view-head", [
      h("div", [h("h1", t("workflows.title")), h("div.sub", t("workflows.sub"))]),
      h("div.spacer"),
      h("button.btn.btn-primary", { onclick: () => newWorkflowMenu() }, ["＋ ", t("workflows.newWorkflow")]),
    ]));

    if (!store.data.workflows.length) {
      root.appendChild(ui.empty("⚡", t("workflows.noWorkflows"), t("workflows.noWorkflowsSub")));
      root.appendChild(h("div.mt-24", templatesRow()));
      return;
    }

    root.appendChild(h("div.grid.grid-3", store.data.workflows.map((w) => wfCard(w))));
    root.appendChild(h("div.mt-24", [h("div.section-title", t("workflows.templates")), templatesRow()]));
  }

  function wfCard(w) {
    const store = S();
    return h("div.card.card-pad", { style: { cursor: "pointer" }, onclick: () => (location.hash = "#/workflows/" + w.id) }, [
      h("div.flex.between.mb-8", [
        h("h3", { style: { fontSize: "16px" } }, w.name || t("workflows.blank")),
        h("label.flex", { style: { gap: "6px" }, onclick: (e) => e.stopPropagation() }, [
          h("input", { type: "checkbox", checked: w.active, onchange: (e) => { store.updateWorkflow(w.id, { active: e.target.checked }); window.CRM.app.rerender(); } }),
          h("span.pill." + (w.active ? "green" : "amber"), { style: { fontSize: "11px" } }, w.active ? t("workflows.active") : t("workflows.paused")),
        ]),
      ]),
      w.trigger ? h("div.flex", { style: { gap: "8px", flexWrap: "wrap" } }, [
        h("span.tag.brand", "⚡ " + t("workflows.triggers." + w.trigger)),
        h("span.tag", (w.steps || []).length + " " + t("workflows.action").toLowerCase()),
      ]) : h("span.faint", t("workflows.chooseTrigger")),
    ]);
  }

  function templatesRow() {
    return h("div.grid.grid-3", [
      tplCard("tplNurture", "🌱", "lead_nurture"),
      tplCard("tplOnboard", "🚀", "onboarding"),
      tplCard("tplRecovery", "🔁", "recovery"),
    ]);
  }
  function tplCard(key, ico, tpl) {
    return h("div.card.card-pad", { style: { cursor: "pointer", borderStyle: "dashed" }, onclick: () => createFromTemplate(tpl) }, [
      h("div", { style: { fontSize: "28px" } }, ico),
      h("h3.mt-8", { style: { fontSize: "15px" } }, t("workflows." + key)),
      h("span.link.mt-8", "＋ " + t("common.create")),
    ]);
  }

  function newWorkflowMenu() {
    const m = ui.modal({ title: t("workflows.newWorkflow"), icon: "⚡" });
    m.setBody(h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
      h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { m.close(); const w = S().addWorkflow({ name: t("workflows.blank") }); location.hash = "#/workflows/" + w.id; } }, "📄 " + t("workflows.blank")),
      h("div.divider"),
      h("div.section-title", t("workflows.templates")),
      h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { m.close(); createFromTemplate("lead_nurture"); } }, "🌱 " + t("workflows.tplNurture")),
      h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { m.close(); createFromTemplate("onboarding"); } }, "🚀 " + t("workflows.tplOnboard")),
      h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { m.close(); createFromTemplate("recovery"); } }, "🔁 " + t("workflows.tplRecovery")),
    ]));
  }

  function createFromTemplate(tpl) {
    const store = S();
    let w;
    if (tpl === "lead_nurture") w = store.addWorkflow({ name: t("workflows.tplNurture"), active: true, trigger: "form_submitted", steps: [
      { type: "action", action: "send_email", config: "Welcome email" },
      { type: "delay", days: 2 },
      { type: "action", action: "send_email", config: "Case study" },
      { type: "condition", label: "Opened email?" },
      { type: "action", action: "assign_task", config: "Sales call" },
    ] });
    else if (tpl === "onboarding") w = store.addWorkflow({ name: t("workflows.tplOnboard"), active: true, trigger: "payment_received", steps: [
      { type: "action", action: "send_email", config: "Kickoff & welcome kit" },
      { type: "action", action: "assign_task", config: "Schedule onboarding call" },
      { type: "delay", days: 1 },
      { type: "action", action: "notify_team", config: "New client onboarded 🎉" },
    ] });
    else w = store.addWorkflow({ name: t("workflows.tplRecovery"), active: false, trigger: "deal_stage_changed", steps: [
      { type: "condition", label: "Stalled 7+ days?" },
      { type: "action", action: "send_sms", config: "Still interested?" },
      { type: "delay", days: 3 },
      { type: "action", action: "notify_team", config: "Re-engage deal" },
    ] });
    location.hash = "#/workflows/" + w.id;
  }

  // ---------------- BUILDER ----------------
  function renderBuilder(root, id) {
    const store = S();
    const w = store.byId("workflows", id);
    if (!w) { location.hash = "#/workflows"; return; }
    w.steps = w.steps || [];

    root.appendChild(h("div.view-head", [
      h("button.btn.btn-ghost", { onclick: () => (location.hash = "#/workflows") }, "← " + t("common.back")),
      ui.input(w.name, { style: "font-weight:700;font-size:16px;max-width:320px", oninput: (e) => store.updateWorkflow(w.id, { name: e.target.value }) }),
      h("div.spacer"),
      h("label.flex", { style: { gap: "8px" } }, [h("input", { type: "checkbox", checked: w.active, onchange: (e) => { store.updateWorkflow(w.id, { active: e.target.checked }); window.CRM.app.rerender(); } }), h("span.pill." + (w.active ? "green" : "amber"), w.active ? t("workflows.active") : t("workflows.paused"))]),
      h("button.btn.btn-danger", { onclick: () => ui.confirm(t("common.deleteConfirm"), () => { store.deleteWorkflow(w.id); location.hash = "#/workflows"; }) }, t("common.delete")),
    ]));

    const canvas = h("div.wf-canvas");

    // trigger node
    if (!w.trigger) {
      canvas.appendChild(h("button.wf-add", { onclick: () => pickTrigger(w) }, "⚡ " + t("workflows.chooseTrigger")));
    } else {
      canvas.appendChild(node("trigger", "⚡ " + t("workflows.trigger"), t("workflows.triggers." + w.trigger), () => pickTrigger(w)));
      w.steps.forEach((step, i) => {
        canvas.appendChild(h("div.wf-connector"));
        canvas.appendChild(stepNode(w, step, i));
      });
      canvas.appendChild(h("div.wf-connector"));
      canvas.appendChild(addStepBtn(w));
    }

    root.appendChild(h("div.card.card-pad", canvas));
  }

  function node(kind, head, body, onEdit) {
    return h("div.wf-node." + kind, [
      h("div.wf-node-head", head),
      h("div.wf-node-body", { style: { cursor: onEdit ? "pointer" : "default" }, onclick: onEdit }, body),
    ]);
  }

  function stepNode(w, step, i) {
    const store = S();
    const remove = h("button.icon-btn", { style: { width: "26px", height: "26px", minWidth: "26px", fontSize: "13px", float: "right" }, onclick: (e) => { e.stopPropagation(); w.steps.splice(i, 1); store.updateWorkflow(w.id, { steps: w.steps }); window.CRM.app.rerender(); } }, "×");
    if (step.type === "action") return h("div.wf-node.action", [h("div.wf-node-head", ["🎬 " + t("workflows.actions." + step.action), remove]), h("div.wf-node-body", { style: { cursor: "pointer" }, onclick: () => editStep(w, step, i) }, step.config || t("workflows.stepConfig"))]);
    if (step.type === "delay") return h("div.wf-node.delay", [h("div.wf-node-head", ["⏳ " + t("workflows.delay"), remove]), h("div.wf-node-body", { style: { cursor: "pointer" }, onclick: () => editStep(w, step, i) }, (step.days || 1) + " " + t("dashboard.days"))]);
    if (step.type === "condition") return h("div.wf-node.condition", [h("div.wf-node-head", ["🔀 " + t("workflows.condition"), remove]), h("div.wf-node-body", { style: { cursor: "pointer" }, onclick: () => editStep(w, step, i) }, [step.label || "If / Else", h("div.flex", { style: { gap: "6px", marginTop: "8px" } }, [h("span.pill.green", "✓ Yes"), h("span.pill.red", "✗ No")])])]);
    return h("div");
  }

  function addStepBtn(w) {
    return h("button.wf-add", { onclick: () => {
      const m = ui.modal({ title: t("workflows.addStep"), icon: "＋" });
      m.setBody(h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
        h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { addStep(w, { type: "action", action: "send_email", config: "" }); m.close(); } }, "🎬 " + t("workflows.addAction")),
        h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { addStep(w, { type: "condition", label: "" }); m.close(); } }, "🔀 " + t("workflows.addCondition")),
        h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { addStep(w, { type: "delay", days: 2 }); m.close(); } }, "⏳ " + t("workflows.addDelay")),
      ]));
    } }, "＋ " + t("workflows.addStep"));
  }
  function addStep(w, step) { w.steps = w.steps || []; w.steps.push(step); S().updateWorkflow(w.id, { steps: w.steps }); window.CRM.app.rerender(); }

  function pickTrigger(w) {
    const m = ui.modal({ title: t("workflows.chooseTrigger"), icon: "⚡" });
    m.setBody(h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, TRIGGERS.map((tr) =>
      h("button.btn", { style: { justifyContent: "flex-start" }, onclick: () => { S().updateWorkflow(w.id, { trigger: tr }); m.close(); window.CRM.app.rerender(); } }, "⚡ " + t("workflows.triggers." + tr)))));
  }

  function editStep(w, step, i) {
    const m = ui.modal({ title: t("workflows.stepConfig"), icon: "⚙️" });
    if (step.type === "action") {
      m.setBody(h("div.form-grid", [
        ui.field(t("workflows.action"), ui.select(ACTIONS.map((a) => ({ value: a, label: t("workflows.actions." + a) })), step.action, (v) => (step.action = v)), { full: true }),
        ui.field(t("workflows.stepConfig"), ui.input(step.config, { oninput: (e) => (step.config = e.target.value) }), { full: true }),
      ]));
    } else if (step.type === "delay") {
      m.setBody(ui.field(t("workflows.delay") + " (" + t("dashboard.days") + ")", ui.input(step.days, { type: "number", min: "1", oninput: (e) => (step.days = Number(e.target.value) || 1) })));
    } else {
      m.setBody(ui.field(t("workflows.condition"), ui.input(step.label, { oninput: (e) => (step.label = e.target.value), placeholder: "If … / Else …" })));
    }
    m.setFooter([h("button.btn", { onclick: m.close }, t("common.cancel")),
      h("button.btn.btn-primary", { onclick: () => { S().updateWorkflow(w.id, { steps: w.steps }); m.close(); window.CRM.app.rerender(); } }, t("common.save"))]);
  }

  window.CRM.views.workflows = { render };
})();
