/* ==========================================================================
   أسواق البسيط — Notif (جرس الإشعارات في الهيدر)
   - يظهر للمسجلين فقط — الضيوف لا يرونه.
   - العدد من الـBackend (المصدر) — يُحدَّث كل 60 ثانية + عند تغيير الدخول.
   ========================================================================== */
(function (global) {
  "use strict";

  let timer = null;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  function ensureBell() {
    document.querySelectorAll(".header-actions").forEach((box) => {
      if (box.querySelector("[data-notif-bell]")) return;
      const a = document.createElement("a");
      a.href = "account.html?view=notifications";
      a.className = "notif-bell";
      a.setAttribute("data-notif-bell", "");
      a.setAttribute("aria-label", "الإشعارات");
      a.hidden = true;
      a.innerHTML = "🔔<span class=\"notif-count\" data-notif-count hidden></span>";
      const authLink = box.querySelector("[data-auth-link]");
      box.insertBefore(a, authLink || box.firstChild);
    });
  }

  function paint(count) {
    document.querySelectorAll("[data-notif-bell]").forEach((bell) => {
      const loggedIn = !!(global.Basit.Auth && global.Basit.Auth.isLoggedIn());
      bell.hidden = !loggedIn;
      const badge = bell.querySelector("[data-notif-count]");
      if (!badge) return;
      if (loggedIn && count > 0) {
        badge.hidden = false;
        badge.textContent = count > 9 ? "+9" : String(count);
        bell.setAttribute("aria-label", "الإشعارات — " + count + " غير مقروءة");
      } else {
        badge.hidden = true;
        bell.setAttribute("aria-label", "الإشعارات");
      }
    });
  }

  async function refresh() {
    const Auth = global.Basit.Auth;
    if (!Auth || !Auth.isLoggedIn()) { paint(0); return; }
    try {
      const res = await fetch(base() + "/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      paint(Number((data.data && data.data.count) || 0));
    } catch (e) { /* تجاهل */ }
  }

  function init() {
    ensureBell();
    paint(0);
    const Auth = global.Basit.Auth;
    if (Auth) Auth.onChange(() => refresh());
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, 60000); // تحديث العدد كل دقيقة
  }

  global.Basit = global.Basit || {};
  global.Basit.Notif = { init, refresh };
})(window);
