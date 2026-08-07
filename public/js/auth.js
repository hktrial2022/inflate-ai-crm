/* ============================================================
   Auth — local access gate + branded login / sign-up screen.
   Supports: email+password login, self-service registration,
   and Google / Apple buttons (wired to Supabase OAuth when the
   cloud adapter is present; otherwise they explain the 1-time setup).
   ------------------------------------------------------------
   This is a CLIENT-SIDE gate. It is NOT production security by
   itself. For real, secure auth (incl. working Google/Apple),
   connect Supabase Auth — see docs/AUTH.md.
   ============================================================ */
(function () {
  window.CRM = window.CRM || {};
  const SESSION_KEY = "crm_session";
  const t = (k, v) => window.CRM.i18n.t(k, v);

  function isLoggedIn() {
    const id = localStorage.getItem(SESSION_KEY);
    return !!(id && window.CRM.store.byId("team", id));
  }
  function currentUserId() { return localStorage.getItem(SESSION_KEY); }

  function login(email, password) {
    const store = window.CRM.store;
    const m = store.data.team.find((x) => (x.email || "").trim().toLowerCase() === (email || "").trim().toLowerCase());
    if (!m) return { ok: false, reason: "noUser" };
    const expected = m.password || "inflate2025";
    if ((password || "") !== expected) return { ok: false, reason: "wrongPassword" };
    localStorage.setItem(SESSION_KEY, m.id);
    return { ok: true, member: m };
  }

  function register(name, email, password) {
    const store = window.CRM.store;
    const exists = store.data.team.find((x) => (x.email || "").trim().toLowerCase() === (email || "").trim().toLowerCase());
    if (exists) return { ok: false, reason: "emailExists" };
    const member = store.addMember({ name: name.trim(), email: email.trim(), role: "sales", password: password });
    localStorage.setItem(SESSION_KEY, member.id);
    return { ok: true, member: member };
  }

  function logout() { localStorage.removeItem(SESSION_KEY); location.reload(); }

  // Google / Apple. Uses Supabase OAuth if the cloud adapter is wired,
  // otherwise shows the (bilingual) enable-it instructions.
  function loginWithProvider(provider) {
    if (window.CRM.cloud && typeof window.CRM.cloud.signInWithOAuth === "function") {
      window.CRM.cloud.signInWithOAuth(provider); // redirects to provider
      return;
    }
    const label = provider === "google" ? "Google" : "Apple";
    window.CRM.ui.modal({
      title: t("auth.oauthTitle", { provider: label }),
      icon: provider === "google" ? "G" : "",
      body: window.CRM.ui.h("p", { style: { margin: 0, lineHeight: 1.6 } }, t("auth.oauthBody", { provider: label })),
      footer: window.CRM.ui.h("button.btn.btn-primary", { onclick: (e) => e.target.closest(".modal-overlay").remove() }, "OK"),
    });
  }

  // ---------------- Login / Sign-up screen ----------------
  function showLogin() {
    const { h, mount } = window.CRM.ui;
    const root = document.getElementById("login-root");
    root.style.display = "block";
    let mode = "login"; // 'login' | 'signup'

    function render() {
      window.CRM.i18n.applyStatic();
      const isSignup = mode === "signup";

      const nameInput = h("input.input", { type: "text", placeholder: "Ana Ruiz", autocomplete: "name" });
      const emailInput = h("input.input", { type: "email", placeholder: "you@inflate.ai", autocomplete: "username" });
      const pwInput = h("input.input", { type: "password", placeholder: "••••••••", autocomplete: isSignup ? "new-password" : "current-password" });
      const pw2Input = h("input.input", { type: "password", placeholder: "••••••••", autocomplete: "new-password" });
      const errBox = h("div.login-error.hidden");

      function fail(msg) { errBox.textContent = msg; errBox.classList.remove("hidden"); }

      function submit(e) {
        if (e) e.preventDefault();
        errBox.classList.add("hidden");
        if (isSignup) {
          if (!nameInput.value.trim()) return fail(t("auth.nameRequired"));
          if (!/.+@.+\..+/.test(emailInput.value)) return fail(t("auth.emailRequired"));
          if ((pwInput.value || "").length < 6) return fail(t("auth.passwordShort"));
          if (pwInput.value !== pw2Input.value) return fail(t("auth.passwordMismatch"));
          const res = register(nameInput.value, emailInput.value, pwInput.value);
          if (!res.ok) return fail(t("auth." + res.reason));
          location.reload();
        } else {
          const res = login(emailInput.value, pwInput.value);
          if (!res.ok) { fail(t("auth." + res.reason)); pwInput.focus(); pwInput.select(); return; }
          location.reload();
        }
      }

      const oauth = h("div.login-oauth", [
        h("button.btn.oauth-btn", { type: "button", onclick: () => loginWithProvider("google") }, [googleIcon(), h("span", t("auth.continueGoogle"))]),
        h("button.btn.oauth-btn", { type: "button", onclick: () => loginWithProvider("apple") }, [appleIcon(), h("span", t("auth.continueApple"))]),
      ]);

      const form = h("form.login-form", { onsubmit: submit }, [
        h("h1.login-title", isSignup ? t("auth.welcomeSignUp") : t("auth.welcome")),
        h("p.login-sub", isSignup ? t("auth.subtitleSignUp") : t("auth.subtitle")),
        errBox,
        oauth,
        h("div.login-divider", h("span", t("auth.orContinue"))),
        isSignup ? h("div.field", [h("label", t("auth.name")), nameInput]) : null,
        h("div.field", [h("label", t("auth.email")), emailInput]),
        h("div.field", [h("label", t("auth.password")), pwInput]),
        isSignup ? h("div.field", [h("label", t("auth.confirmPassword")), pw2Input]) : null,
        !isSignup ? h("div.flex.between", { style: { marginTop: "2px" } }, [
          h("label.flex", { style: { gap: "8px", fontSize: "13px", cursor: "pointer" } }, [h("input", { type: "checkbox", checked: true }), t("auth.rememberMe")]),
          h("span.link", { style: { fontSize: "13px" }, onclick: () => window.CRM.ui.toast(t("auth.forgotHint")) }, t("auth.forgot")),
        ]) : null,
        h("button.btn.btn-primary.login-submit", { type: "submit" }, isSignup ? t("auth.signUp") : t("auth.signIn")),
        h("p.login-switch", [
          isSignup ? t("auth.haveAccount") : t("auth.noAccount"), " ",
          h("span.link", { onclick: () => { mode = isSignup ? "login" : "signup"; render(); } }, isSignup ? t("auth.goSignIn") : t("auth.goSignUp")),
        ]),
        !isSignup ? h("div.login-demo", [
          h("strong", t("auth.demoAccess")),
          h("div", [t("auth.demoHint"), " ", h("code", "inflate2025")]),
          h("div.faint", { style: { marginTop: "6px", fontSize: "12px" } }, "you@inflate.ai · ana@inflate.ai · leo@inflate.ai"),
        ]) : null,
        h("p.login-secure", t("auth.secureNote")),
      ]);

      const langToggle = h("button.login-lang", {
        onclick: () => { window.CRM.i18n.setLang(window.CRM.i18n.getLang() === "en" ? "es" : "en"); render(); },
      }, window.CRM.i18n.getLang() === "en" ? "🇲🇽 Español" : "🇺🇸 English");

      const screen = h("div.login-screen", [
        h("div.login-brand", [
          langToggle,
          h("div.login-brand-inner", [
            h("div.login-logo", "IA"),
            h("h2.login-brand-name", "Inflate AI"),
            h("p.login-tagline", t("auth.tagline")),
            h("div.login-features", [
              feature("📊", "Dashboard"), feature("👤", t("nav.contacts")),
              feature("💼", t("nav.pipeline")), feature("💬", t("nav.inbox")),
            ]),
          ]),
          h("div.login-blob login-blob-1"), h("div.login-blob login-blob-2"),
        ]),
        h("div.login-panel", form),
      ]);

      mount(root, screen);
      setTimeout(() => (isSignup ? nameInput : emailInput).focus(), 30);
    }

    function feature(ico, label) { return h("div.login-feature", [h("span", ico), h("span", label)]); }
    render();
  }

  // Brand icons (inline SVG)
  function googleIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.innerHTML =
      '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 4.5 29.4 2.5 24 2.5 12.1 2.5 2.5 12.1 2.5 24S12.1 45.5 24 45.5 45.5 35.9 45.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M4.3 12.7l6.6 4.8C12.7 13.4 17 10.5 24 10.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 4.5 29.4 2.5 24 2.5 16 2.5 9 7 4.3 12.7z"/><path fill="#4CAF50" d="M24 45.5c5.3 0 10.1-2 13.7-5.3l-6.3-5.3c-2 1.5-4.6 2.4-7.4 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C8.9 40.9 15.9 45.5 24 45.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.3 5.3C41.4 36.3 45.5 30.7 45.5 24c0-1.2-.1-2.4-.4-3.5z"/>';
    return svg;
  }
  function appleIcon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
    svg.innerHTML = '<path fill="currentColor" d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.84.94-2.2 1.66-3.34 1.57-.14-1.12.42-2.31 1.06-3.05.72-.83 2.02-1.44 3.09-1.5.02.34.02.68.02 1zM20.5 17.1c-.55 1.27-.82 1.84-1.53 2.97-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.93-1.01-4.02-1-2.09.01-2.52 1.02-4.06 1.01-1.73-.02-3.05-1.79-4.04-3.36C-.13 17.15-.4 12.1 1.4 9.4c1.06-1.6 2.73-2.53 4.3-2.53 1.6 0 2.6 1.02 3.92 1.02 1.28 0 2.06-1.02 3.91-1.02 1.4 0 2.88.76 3.94 2.08-3.46 1.9-2.9 6.84.03 8.15z"/>';
    return svg;
  }

  window.CRM.auth = { isLoggedIn, currentUserId, login, register, logout, loginWithProvider, showLogin };
})();
