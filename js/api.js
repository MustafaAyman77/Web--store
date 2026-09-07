/* ==========================================================================
   أسواق البسيط — Api (طبقة الاتصال المستقبلية)
   --------------------------------------------------------------------------
   🎯 الهدف: عزل أي اتصال مستقبلي بالـ Backend في مكان واحد.
   - الوضع الحالي (demo): محاكاة محلية فقط — لا يُرسل أي شيء لأي مكان.
   - مستقبلًا: يُضبط BasitConfig.api.mode = "backend" ويُنفَّذ الإرسال
     الحقيقي هنا (ومنها إلى Telegram Bot عبر السيرفر — وليس من المتصفح).
   ⚠️ يُمنع منعًا باتًا وضع أي Bot Token أو بيانات حساسة في هذا الملف.
   ========================================================================== */
(function (global) {
  "use strict";

  /** توليد رقم طلب تجريبي — مثال: BS-2026-XXXX */
  function makeDemoOrderNo() {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return "BS-" + new Date().getFullYear() + "-" + rand;
  }

  /** محاكاة تأخير الشبكة في وضع العرض */
  function fakeLatency(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms || 900));
  }

  const Api = {
    /** إرسال الطلب — يُرجع Promise بالنتيجة { ok, orderNo, mode } */
    async submitOrder(orderPayload) {
      const { mode, endpoints, timeoutMs } = global.BasitConfig.api;

      if (mode === "backend") {
        // --- التنفيذ الحقيقي مستقبلًا (عبر سيرفر المحل فقط) ---
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(endpoints.orders, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderPayload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const data = await res.json();
          return { ok: true, mode: "backend", orderNo: data.orderNo, data };
        } catch (err) {
          clearTimeout(timer);
          return { ok: false, mode: "backend", error: String(err && err.message || err) };
        }
      }

      // --- وضع العرض التجريبي: لا إرسال حقيقي ---
      await fakeLatency(900);
      void orderPayload;
      return { ok: true, mode: "demo", orderNo: makeDemoOrderNo() };
    },

    /** جلب المنتجات — حاليًا من البيانات المحلية، ومستقبلًا من الـ Backend */
    async getProducts() {
      if (global.BasitConfig.api.mode === "backend") {
        const res = await fetch(global.BasitConfig.api.endpoints.products);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      }
      return {
        categories: global.BasitData.categories,
        products: global.BasitData.products,
        offers: global.BasitData.offers,
      };
    },
  };

  global.Basit = global.Basit || {};
  global.Basit.Api = Api;
})(window);
