/* ============================================================
   Charts — hand-drawn inline SVG. No external libraries.
   bar, line, donut, funnel. Theme-aware via CSS variables.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const SVGNS = "http://www.w3.org/2000/svg";

  function svg(w, h, attrs) {
    const el = document.createElementNS(SVGNS, "svg");
    el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    el.setAttribute("class", "chart-svg");
    el.setAttribute("role", "img");
    for (const k in (attrs || {})) el.setAttribute(k, attrs[k]);
    return el;
  }
  function node(name, attrs, text) {
    const el = document.createElementNS(SVGNS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  }
  const PALETTE = ["#6d5efc", "#22d3ee", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9", "#14b8a6"];

  // ---------- Bar chart ----------
  // data: [{label, value, color?}]
  function bar(data, opts) {
    opts = opts || {};
    const W = 520, H = opts.height || 240, padL = 48, padB = 44, padT = 16, padR = 12;
    const s = svg(W, H);
    const max = Math.max(1, ...data.map((d) => d.value));
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const bw = plotW / data.length;
    const grid = cssVar("--border"); const txt = cssVar("--text-dim");
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      s.appendChild(node("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: grid, "stroke-width": 1 }));
      s.appendChild(node("text", { x: padL - 8, y: y + 4, "text-anchor": "end", "font-size": 10, fill: txt }, fmt(max - (max * i) / 4, opts)));
    }
    data.forEach((d, i) => {
      const bh = (d.value / max) * plotH;
      const x = padL + i * bw + bw * 0.2;
      const w = bw * 0.6;
      const y = padT + plotH - bh;
      const r = Math.min(6, w / 2);
      const rect = node("rect", { x, y, width: w, height: Math.max(1, bh), rx: r, fill: d.color || PALETTE[i % PALETTE.length] });
      rect.appendChild(node("title", {}, `${d.label}: ${fmt(d.value, opts)}`));
      s.appendChild(rect);
      s.appendChild(node("text", { x: padL + i * bw + bw / 2, y: H - padB + 16, "text-anchor": "middle", "font-size": 10.5, fill: txt }, trunc(d.label, 10)));
    });
    return s;
  }

  // ---------- Line chart (single series) ----------
  // data: [{label, value}]
  function line(data, opts) {
    opts = opts || {};
    const W = 520, H = opts.height || 220, padL = 44, padB = 34, padT = 14, padR = 14;
    const s = svg(W, H);
    const max = Math.max(1, ...data.map((d) => d.value));
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const grid = cssVar("--border"); const txt = cssVar("--text-dim"); const brand = cssVar("--brand-1");
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      s.appendChild(node("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: grid, "stroke-width": 1 }));
      s.appendChild(node("text", { x: padL - 8, y: y + 4, "text-anchor": "end", "font-size": 10, fill: txt }, fmt(max - (max * i) / 3, opts)));
    }
    const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
    const pts = data.map((d, i) => [padL + i * stepX, padT + plotH - (d.value / max) * plotH]);
    // area
    const gid = "grad_" + Math.floor(pts.length * 97) ;
    const defs = node("defs");
    const lg = node("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.appendChild(node("stop", { offset: "0%", "stop-color": brand, "stop-opacity": .35 }));
    lg.appendChild(node("stop", { offset: "100%", "stop-color": brand, "stop-opacity": 0 }));
    defs.appendChild(lg); s.appendChild(defs);
    if (pts.length) {
      const areaD = `M ${pts[0][0]} ${padT + plotH} ` + pts.map((p) => `L ${p[0]} ${p[1]}`).join(" ") + ` L ${pts[pts.length - 1][0]} ${padT + plotH} Z`;
      s.appendChild(node("path", { d: areaD, fill: `url(#${gid})` }));
      const lineD = pts.map((p, i) => (i ? "L" : "M") + ` ${p[0]} ${p[1]}`).join(" ");
      s.appendChild(node("path", { d: lineD, fill: "none", stroke: brand, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      pts.forEach((p, i) => {
        const c = node("circle", { cx: p[0], cy: p[1], r: 3.5, fill: cssVar("--bg-elev"), stroke: brand, "stroke-width": 2 });
        c.appendChild(node("title", {}, `${data[i].label}: ${fmt(data[i].value, opts)}`));
        s.appendChild(c);
      });
    }
    data.forEach((d, i) => {
      if (data.length > 8 && i % 2) return;
      s.appendChild(node("text", { x: padL + i * stepX, y: H - padB + 16, "text-anchor": "middle", "font-size": 10, fill: txt }, d.label));
    });
    return s;
  }

  // ---------- Donut ----------
  // data: [{label, value, color?}]
  function donut(data, opts) {
    opts = opts || {};
    const size = 200, cx = size / 2, cy = size / 2, r = 78, rin = 50;
    const s = svg(size, size);
    const total = data.reduce((a, b) => a + b.value, 0) || 1;
    let ang = -Math.PI / 2;
    data.forEach((d, i) => {
      const frac = d.value / total;
      const a2 = ang + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const xi2 = cx + rin * Math.cos(a2), yi2 = cy + rin * Math.sin(a2);
      const xi1 = cx + rin * Math.cos(ang), yi1 = cy + rin * Math.sin(ang);
      const path = node("path", {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${rin} ${rin} 0 ${large} 0 ${xi1} ${yi1} Z`,
        fill: d.color || PALETTE[i % PALETTE.length],
      });
      path.appendChild(node("title", {}, `${d.label}: ${d.value} (${Math.round(frac * 100)}%)`));
      s.appendChild(path);
      ang = a2;
    });
    s.appendChild(node("text", { x: cx, y: cy - 4, "text-anchor": "middle", "font-size": 24, "font-weight": 800, fill: cssVar("--text") }, String(total)));
    s.appendChild(node("text", { x: cx, y: cy + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("--text-dim") }, opts.centerLabel || ""));
    return s;
  }

  function legend(data) {
    const { h } = window.CRM.ui;
    return h("div.legend", data.map((d, i) => h("div.legend-item", [
      h("span.dot", { style: { background: d.color || PALETTE[i % PALETTE.length], width: "10px", height: "10px" } }),
      h("span", d.label),
      h("span.faint", { style: { marginLeft: "2px" } }, String(d.value)),
    ])));
  }

  // ---------- Funnel ----------
  // data: [{label, value, color, conv}]
  function funnel(data) {
    const { h } = window.CRM.ui;
    const max = Math.max(1, ...data.map((d) => d.value));
    return h("div.funnel", data.map((d) =>
      h("div.funnel-row", [
        h("div.funnel-label", d.label),
        h("div.funnel-bar-track", h("div.funnel-bar", {
          style: { width: Math.max(6, (d.value / max) * 100) + "%", background: d.color || "var(--brand-1)" },
        }, String(d.value))),
        h("div.funnel-conv", d.conv != null ? d.conv + "%" : ""),
      ])
    ));
  }

  function fmt(v, opts) {
    v = Math.round(v);
    if (opts && opts.currency) return window.CRM.ui.compactCurrency(v);
    return String(v);
  }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  window.CRM.charts = { bar, line, donut, funnel, legend, PALETTE };
})();
