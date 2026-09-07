/* ==========================================================================
   أسواق البسيط — App (نقطة التشغيل)
   --------------------------------------------------------------------------
   ترتيب التحميل في index.html:
     config.js → data.js → cart.js → api.js → ui.js → app.js
   ========================================================================== */
(function (global) {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    try {
      global.Basit.UI.init();
      if (global.Basit.Shop) global.Basit.Shop.init();
    } catch (err) {
      // لا نكسر الصفحة أبدًا — نسجل الخطأ فقط
      if (global.console && console.error) console.error("[Basit] init failed:", err);
    }
  });
})(window);
