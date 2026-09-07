/* ==========================================================================
   أسواق البسيط — Auth (حالة دخول العميل)
   --------------------------------------------------------------------------
   - الجلسة في HttpOnly Cookie (يديرها المتصفح) — لا توكن هنا أبدًا.
   - /api/me يُقرأ مرة واحدة ويُحفظ في الذاكرة + يُحدَّث عند اللزوم.
   - الضيف يكمل كل شيء عادي — الدخول اختياري دائمًا.
   ========================================================================== */
(function (global) {
  "use strict";

  const state = { loaded: false, customer: null };
  const listeners = [];
  let pending = null;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  function emit() {
    paintLinks();
    listeners.forEach((fn) => { try { fn(state.customer); } catch (e) { /* تجاهل */ } });
  }

  async function refresh() {
    try {
      const res = await fetch(base() + "/api/me", { headers: { Accept: "application/json" } });
      state.customer = res.ok ? ((await res.json()).data || null) : null;
    } catch (e) {
      state.customer = null; // بدون Backend = ضيف
    }
    state.loaded = true;
    emit();
    return state.customer;
  }

  /** القراءة المضمونة مرة واحدة (تُستخدم قبل القرارات المعتمدة على الدخول) */
  function ensure() {
    if (state.loaded) return Promise.resolve(state.customer);
    if (!pending) pending = refresh().finally(() => { pending = null; });
    return pending;
  }

  function get() { return state.customer; }
  function isLoggedIn() { return !!state.customer; }
  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  async function logout() {
    try {
      await fetch(base() + "/api/auth/logout", { method: "POST" });
    } catch (e) { /* تجاهل */ }
    state.customer = null;
    state.loaded = true;
    emit();
  }

  /** تحديث روابط الدخول/الحساب في الهيدر — تُستدعى تلقائيًا */
  function paintLinks() {
    const links = document.querySelectorAll("[data-auth-link]");
    if (!links.length) return;
    links.forEach((a) => {
      if (state.customer) {
        a.href = "account.html";
        a.innerHTML = "👤 حسابي";
        a.setAttribute("aria-label", "حسابي");
      } else {
        a.href = "login.html";
        a.innerHTML = "🔑 دخول";
        a.setAttribute("aria-label", "تسجيل الدخول");
      }
    });
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }
  ready(() => { paintLinks(); ensure(); });

  global.Basit = global.Basit || {};
  global.Basit.Auth = { ensure, refresh, get, isLoggedIn, onChange, logout, paintLinks };
})(window);
