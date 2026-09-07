/* ==========================================================================
   أسواق البسيط — Promos (العروض الحقيقية من الـBackend)
   --------------------------------------------------------------------------
   - المصدر الوحيد: GET /api/promotions (النشطة فقط من السيرفر).
   - بدون Backend: null → الواجهة تستخدم الباقات التجريبية (Data.offers).
   - العد التنازلي يُحسب من endsAt القادم من السيرفر (UTC) — الباك هو الحقيقة.
   ========================================================================== */
(function (global) {
  "use strict";

  const state = { loaded: false, promos: null };
  let pending = null;

  function parseUtcTs(v) {
    if (!v) return null;
    try {
      const d = new Date(String(v).includes("T") ? v : String(v).replace(" ", "T") + "Z");
      return isNaN(d) ? null : d;
    } catch (e) { return null; }
  }

  /** نص متبقي لنهاية العرض — "" لو بدون نهاية أو انتهى */
  function remainingText(endsAt, nowMs) {
    const d = parseUtcTs(endsAt);
    if (!d) return "";
    const ms = d.getTime() - (nowMs || Date.now());
    if (ms <= 0) return "انتهى";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return "ينتهي خلال " + mins + " دقيقة";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return "ينتهي خلال " + hours + " ساعة";
    const days = Math.floor(hours / 24);
    if (days < 30) return "ينتهي خلال " + days + (days === 1 ? " يوم" : " أيام");
    return "ينتهي " + d.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
  }

  async function load() {
    try {
      const Api = global.Basit && global.Basit.Api;
      if (!Api || !Api.getPromotions) { state.promos = null; }
      else {
        const list = await Api.getPromotions();
        state.promos = Array.isArray(list) ? list : null;
      }
    } catch (e) {
      state.promos = null; // أوفلاين → الباقات التجريبية
    }
    state.loaded = true;
    return state.promos;
  }

  function ensure() {
    if (state.loaded) return Promise.resolve(state.promos);
    if (!pending) pending = load().finally(() => { pending = null; });
    return pending;
  }

  function list() { return state.promos; }

  /** وصف مختصر لقيمة العرض (للشارة) */
  function valueText(promo) {
    if (!promo) return "";
    if (promo.type === "percentage") return "خصم " + promo.discountValue + "%";
    if (promo.type === "fixed_discount") return "خصم " + promo.discountValue + " ج.م";
    if (promo.type === "fixed_price") return "بسعر " + promo.fixedPrice + " ج.م";
    return "";
  }

  /** تجميع منتجات الواجهة (التي تحمل promotion.id) حسب العرض */
  function groupProducts(products) {
    const groups = {};
    (products || []).forEach((p) => {
      if (p && p.promotion && p.promotion.id) {
        (groups[p.promotion.id] = groups[p.promotion.id] || []).push(p);
      }
    });
    return groups;
  }

  /** تحديث كل عناصر العد التنازلي [data-countdown] — يُستدعى دوريًا */
  function tick() {
    try {
      const now = Date.now();
      document.querySelectorAll("[data-countdown]").forEach((el) => {
        const t = remainingText(el.getAttribute("data-countdown"), now);
        if (!t) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = "⏳ " + t;
      });
    } catch (e) { /* تجاهل */ }
  }

  global.Basit = global.Basit || {};
  global.Basit.Promos = { ensure, list, valueText, groupProducts, remainingText, tick, parseUtcTs };
})(window);
