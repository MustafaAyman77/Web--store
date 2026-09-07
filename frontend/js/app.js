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
    let booted = false;
    const boot = () => {
      if (booted) return;
      booted = true;
      try {
        global.Basit.UI.init();
        if (global.Basit.Shop) global.Basit.Shop.init();
        if (global.Basit.Checkout) global.Basit.Checkout.init();
        if (global.Basit.Success) global.Basit.Success.init();
        if (global.Basit.Login) global.Basit.Login.init();
        if (global.Basit.Account) global.Basit.Account.init();
        if (global.Basit.Track) global.Basit.Track.init();
        if (global.Basit.Notif) global.Basit.Notif.init();
      } catch (err) {
        // لا نكسر الصفحة أبدًا — نسجل الخطأ فقط
        if (global.console && console.error) console.error("[Basit] init failed:", err);
      }
    };
    // محاولة جلب المنتجات من الـ Backend أولًا (بمهلة) — وإلا الإقلاع محليًا
    try {
      const api = global.Basit.Api;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500));
      const recsPreload = global.Basit.Recs ? global.Basit.Recs.preload().catch(() => {}) : Promise.resolve();
      const storePreload = global.Basit.Store ? global.Basit.Store.ensure().catch(() => {}) : Promise.resolve();
      Promise.race([api.getProducts(), timeout])
        .then((data) => {
          if (data && data.products && data.products.length) global.BasitData._replaceAll(data);
        })
        .catch(() => { /* الوضع المحلي — تجاهل */ })
        .finally(() => {
          Promise.all([Promise.race([recsPreload, timeout]).catch(() => {}), Promise.race([storePreload, timeout]).catch(() => {})])
            .finally(() => {
              // بوابة الصيانة قبل أي رسم — لوحة /admin تطبيق منفصل لا يتأثر
              try {
                if (global.Basit.Store && global.Basit.Store.maintenanceGate()) { booted = true; return; }
              } catch (e) { /* تجاهل */ }
              boot();
            });
        });
      setTimeout(boot, 3000); // أمان: إقلاع إجباري
    } catch (err) {
      boot();
    }
  });
})(window);
