/* ============================================================
   UI helpers — DOM builder (h), modals, toasts, formatters,
   reusable widgets (avatars, tag inputs, selects).
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const store = window.CRM.store;

  // ---------- Hyperscript-style element builder ----------
  // h('div.card#id', {onclick, ...attrs}, [children])  |  h('span', 'text')
  function h(tag, props, children) {
    // allow h(tag, children)
    if (props != null && (typeof props === "string" || Array.isArray(props) || props instanceof Node)) {
      children = props; props = {};
    }
    props = props || {};
    let tagName = "div", id = null;
    const classes = [];
    tag.split(/(?=[.#])/).forEach((part, i) => {
      if (i === 0 && !/[.#]/.test(part[0])) tagName = part;
      else if (part[0] === ".") classes.push(part.slice(1));
      else if (part[0] === "#") id = part.slice(1);
    });
    const el = document.createElement(tagName);
    if (id) el.id = id;
    if (classes.length) el.className = classes.join(" ");
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = (el.className ? el.className + " " : "") + v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
      else el.setAttribute(k, v);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children == null) return;
    if (Array.isArray(children)) children.forEach((c) => append(el, c));
    else if (children instanceof Node) el.appendChild(children);
    else el.appendChild(document.createTextNode(String(children)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el, node) { clear(el); append(el, node); return el; }

  // ---------- Formatters ----------
  const t = () => window.CRM.i18n.t;
  function currency(n) {
    const cur = (store.data.settings && store.data.settings.currency) || "USD";
    try { return new Intl.NumberFormat(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n || 0); }
    catch (e) { return "$" + (n || 0).toLocaleString(); }
  }
  function compactCurrency(n) {
    n = n || 0; const sign = n < 0 ? "-" : ""; n = Math.abs(n);
    const cur = (store.data.settings && store.data.settings.currency) || "USD";
    const sym = cur === "MXN" ? "MX$" : cur === "EUR" ? "€" : "$";
    if (n >= 1e6) return sign + sym + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return sign + sym + (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return sign + sym + n.toLocaleString();
  }
  function initials(name) {
    if (!name) return "?";
    const p = name.trim().split(/\s+/);
    return ((p[0] ? p[0][0] : "") + (p[1] ? p[1][0] : "")).toUpperCase() || "?";
  }
  function fullName(c) { return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || (window.CRM.i18n.getLang() === "es" ? "(sin nombre)" : "(no name)"); }
  function daysBetween(a, b) { return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 86400000)); }
  function daysSince(iso) { if (!iso) return null; return daysBetween(iso, new Date().toISOString()); }
  function relTime(iso) {
    if (!iso) return window.CRM.i18n.t("common.never");
    const d = daysSince(iso);
    if (d === 0) return window.CRM.i18n.t("common.today");
    if (d === 1) return window.CRM.i18n.t("common.yesterday");
    return window.CRM.i18n.t("common.daysAgo", { n: d });
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { month: "short", day: "numeric" }) + " · " +
      d.toLocaleTimeString(window.CRM.i18n.getLang() === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- Reusable widgets ----------
  function avatar(nameOrMember, size) {
    let name, color;
    if (typeof nameOrMember === "object" && nameOrMember) { name = nameOrMember.name; color = nameOrMember.color; }
    else { name = nameOrMember; }
    return h("div.avatar" + (size ? "." + size : ""), { style: { background: color || pastel(name) } }, initials(name));
  }
  function pastel(str) {
    let hash = 0; str = str || "?";
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 60% 55%)`;
  }
  function ownerCell(ownerId) {
    const m = store.member(ownerId);
    if (!m) return h("span.faint", window.CRM.i18n.t("common.unassigned"));
    return h("div.person-cell", [avatar(m, "sm"), h("span", m.name)]);
  }
  function tagList(tags) {
    if (!tags || !tags.length) return h("span.faint", "—");
    return h("div.flex.wrap", { style: { gap: "5px" } }, tags.map((tg) => h("span.tag", tg)));
  }

  // select from options [{value,label}]
  function select(options, value, onChange, extra) {
    const el = h("select.select", Object.assign({ onchange: (e) => onChange(e.target.value) }, extra || {}),
      options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)));
    return el;
  }

  function memberOptions(includeUnassigned) {
    const opts = store.data.team.map((m) => ({ value: m.id, label: m.name }));
    if (includeUnassigned) opts.unshift({ value: "", label: window.CRM.i18n.t("common.unassigned") });
    return opts;
  }
  function companyOptions(includeNone) {
    const opts = store.data.companies.map((c) => ({ value: c.id, label: c.name }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    if (includeNone) opts.unshift({ value: "", label: "—" });
    return opts;
  }
  function contactOptions(includeNone) {
    const opts = store.data.contacts.map((c) => ({ value: c.id, label: fullName(c) + (c.email ? " · " + c.email : "") }));
    if (includeNone) opts.unshift({ value: "", label: "—" });
    return opts;
  }

  // Tag input: value is array; onChange(newArray)
  function tagInput(values, onChange) {
    values = values.slice();
    const wrap = h("div.chip-input");
    const input = h("input", { type: "text", placeholder: window.CRM.i18n.t("common.addTag") });
    function render() {
      clear(wrap);
      values.forEach((v, i) => {
        wrap.appendChild(h("span.chip", [v, h("span.x", { onclick: () => { values.splice(i, 1); render(); onChange(values.slice()); } }, "×")]));
      });
      wrap.appendChild(input);
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) { e.preventDefault(); values.push(input.value.trim()); input.value = ""; render(); onChange(values.slice()); }
      else if (e.key === "Backspace" && !input.value && values.length) { values.pop(); render(); onChange(values.slice()); }
    });
    render();
    return wrap;
  }

  // field wrapper
  function field(label, control, opts) {
    opts = opts || {};
    return h("div.field" + (opts.full ? ".full" : ""), [
      label ? h("label", label) : null,
      control,
      opts.hint ? h("span.hint", opts.hint) : null,
    ]);
  }
  function input(value, attrs) { return h("input.input", Object.assign({ value: value == null ? "" : value }, attrs || {})); }
  function textarea(value, attrs) { return h("textarea.textarea", Object.assign({}, attrs || {}), value || ""); }

  // ---------- Modal ----------
  function modal(opts) {
    // opts: {title, icon, body(node|fn), footer(node), wide, onClose}
    const root = document.getElementById("modal-root");
    const bodyEl = h("div.modal-body");
    const footEl = h("div.modal-foot");
    const box = h("div.modal" + (opts.wide ? ".wide" : ""), [
      h("div.modal-head", [
        opts.icon ? h("div.brand-logo", { style: { width: "34px", height: "34px", fontSize: "15px" } }, opts.icon) : null,
        h("h3", opts.title || ""),
        h("div", { style: { marginLeft: "auto" } }, h("button.icon-btn", { onclick: close, title: "Close" }, "×")),
      ]),
      bodyEl, footEl,
    ]);
    const overlay = h("div.modal-overlay", { onclick: (e) => { if (e.target === overlay) close(); } }, box);

    function close() { if (opts.onClose) opts.onClose(); overlay.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);

    const api = {
      close,
      setBody(node) { mount(bodyEl, typeof node === "function" ? node(api) : node); return api; },
      setFooter(nodes) { mount(footEl, nodes); return api; },
      el: box,
    };
    if (opts.body) api.setBody(opts.body);
    if (opts.footer) api.setFooter(opts.footer);
    root.appendChild(overlay);
    return api;
  }

  function confirm(message, onYes, opts) {
    opts = opts || {};
    const m = modal({
      title: opts.title || window.CRM.i18n.t("common.confirm"),
      icon: opts.icon || "!",
      body: h("p", { style: { margin: 0 } }, message),
    });
    m.setFooter([
      h("button.btn", { onclick: m.close }, window.CRM.i18n.t("common.cancel")),
      h("button.btn." + (opts.danger === false ? "btn-primary" : "btn-danger"), { onclick: () => { m.close(); onYes(); } }, opts.yes || window.CRM.i18n.t("common.delete")),
    ]);
    return m;
  }

  // ---------- Toast ----------
  function toast(message, type) {
    const root = document.getElementById("toast-root");
    const el = h("div.toast" + (type ? "." + type : ""), message);
    root.appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s, transform .3s"; el.style.opacity = "0"; el.style.transform = "translateX(20px)"; setTimeout(() => el.remove(), 300); }, 2600);
  }

  // ---------- Empty state ----------
  function empty(emoji, title, sub, actionBtn) {
    return h("div.empty", [
      h("div.emoji", emoji),
      h("h3", title),
      sub ? h("p", sub) : null,
      actionBtn || null,
    ]);
  }

  function stagePill(stageId) {
    const s = store.data.stages.find((x) => x.id === stageId);
    if (!s) return h("span.tag", stageId);
    return h("span.tag", { style: { background: s.color + "22", color: s.color, borderColor: "transparent" } }, [
      h("span.dot", { style: { background: s.color } }), store.stageName(stageId),
    ]);
  }

  window.CRM.ui = {
    h, clear, mount, append,
    currency, compactCurrency, initials, fullName, daysSince, daysBetween, relTime, fmtDate, fmtDateTime, pastel,
    avatar, ownerCell, tagList, select, memberOptions, companyOptions, contactOptions,
    tagInput, field, input, textarea, modal, confirm, toast, empty, stagePill,
  };
})();
