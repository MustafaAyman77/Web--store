/* ==========================================================================
   أسواق البسيط — Recs (التوصيات الذكية)
   --------------------------------------------------------------------------
   - يتذكر رقم الهاتف محليًا (بجهاز العميل فقط) لتخصيص الاقتراحات.
   - كل حسابات التوصيات في الـ Backend — هنا عرض فقط + كاش خفيف.
   - بدون Backend: لا توصيات (تُخفى الأقسام تلقائيًا).
   ========================================================================== */
(function (global) {
  "use strict";

  const KEY = "basit_remember";
  const mem = { bought: new Set(), counts: {}, cache: {} };

  function getRemembered() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && /^01[0-9]{9}$/.test(o.phone || "")) return o;
    } catch (e) { /* تجاهل */ }
    return null;
  }

  function remember(phone, name) {
    try {
      phone = String(phone || "").trim();
      if (!/^01[0-9]{9}$/.test(phone)) return;
      localStorage.setItem(KEY, JSON.stringify({ phone, name: String(name || "").slice(0, 60) }));
    } catch (e) { /* تجاهل */ }
  }

  function getPhone() {
    const r = getRemembered();
    return r ? r.phone : "";
  }

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  async function fetchRecs({ cartIds, category, limit, withPhone } = {}) {
    const Api = global.Basit && global.Basit.Api;
    if (!Api) return null;
    const mode = await Api.resolveMode();
    if (mode !== "backend") return null;
    const q = new URLSearchParams();
    // المسجل دخوله: الجلسة هي الهوية — لا نرسل الهاتف
    const loggedIn = !!(global.Basit.Auth && global.Basit.Auth.isLoggedIn());
    const phone = (withPhone === false || loggedIn) ? "" : getPhone();
    if (phone) q.set("customerPhone", phone);
    if (cartIds && cartIds.length) q.set("cartProductIds", cartIds.slice(0, 30).join(","));
    if (category) q.set("category", category);
    q.set("limit", Math.min(12, Math.max(1, Number(limit) || 4)));
    const res = await fetch(base() + "/api/recommendations?" + q);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data && data.data ? data.data : null;
    // توحيد الشكل مع mapProduct: السعر النهائي + الشارة + العد التنازلي
    if (d && Array.isArray(d.recommendations) && Api.mapProduct) {
      d.recommendations = d.recommendations.map((r) => ({ ...Api.mapProduct(r), reason: r.reason, score: r.score }));
    }
    return d;
  }

  /** تحميل "اشتريته قبل كده" قبل أول رسم — يُستدعى من boot */
  async function preload() {
    try {
      if (global.Basit.Auth) await global.Basit.Auth.ensure();
    } catch (e) { /* ضيف */ }
    const loggedIn = !!(global.Basit.Auth && global.Basit.Auth.isLoggedIn());
    if (!getPhone() && !loggedIn) return;
    try {
      const d = await fetchRecs({ limit: 4 });
      if (d) {
        mem.bought = new Set(d.boughtBefore || []);
        mem.counts = d.purchaseCounts || {};
      }
    } catch (e) { /* تجاهل — بدون تخصيص */ }
  }

  function isBought(id) { return mem.bought.has(String(id)); }
  function timesBought(id) { return Number(mem.counts[String(id)] || 0); }

  /** أقسام الرئيسية: الأكثر طلبًا + وصل حديثًا + ممكن يعجبك */
  async function getHomeSections() {
    if (mem.cache.home) return mem.cache.home;
    const out = { popular: [], fresh: [], personal: null };
    try {
      const [a, b] = await Promise.all([
        fetchRecs({ limit: 4, withPhone: false }),
        fetchRecs({ limit: 12, withPhone: false }),
      ]);
      if (a && a.recommendations) out.popular = a.recommendations.slice(0, 4);
      if (b && b.recommendations) out.fresh = b.recommendations.filter((p) => p.isNew).slice(0, 4);
      const loggedIn = !!(global.Basit.Auth && global.Basit.Auth.isLoggedIn());
      if (getPhone() || loggedIn) {
        const c = await fetchRecs({ limit: 4 });
        if (c && c.customerType === "returning" && c.recommendations.length) {
          out.personal = c.recommendations.slice(0, 4);
          mem.bought = new Set(c.boughtBefore || [...mem.bought]);
          Object.assign(mem.counts, c.purchaseCounts || {});
        }
      }
    } catch (e) { /* تجاهل */ }
    mem.cache.home = out;
    return out;
  }

  /** توصيات السلة/الدفع — كاش حسب محتوى السلة */
  async function forCart(cartIds) {
    const ids = (cartIds || []).map(String).filter(Boolean);
    if (!ids.length) return [];
    const key = "cart:" + [...ids].sort().join(",");
    if (mem.cache[key]) return mem.cache[key];
    let list = [];
    try {
      const d = await fetchRecs({ cartIds: ids, limit: 3 });
      if (d && d.recommendations) list = d.recommendations.slice(0, 3);
    } catch (e) { /* تجاهل */ }
    mem.cache[key] = list;
    return list;
  }

  /** توصيات صفحة/نافذة المنتج — نفس القسم */
  async function forProduct(productId, category) {
    const key = "prod:" + productId;
    if (mem.cache[key]) return mem.cache[key];
    let list = [];
    try {
      const d = await fetchRecs({ cartIds: [productId], category, limit: 4 });
      if (d && d.recommendations) list = d.recommendations.filter((p) => p.id !== productId).slice(0, 4);
    } catch (e) { /* تجاهل */ }
    mem.cache[key] = list;
    return list;
  }

  /** ترشيحات شخصية عامة (صفحة الحساب) — بالجلسة للمسجل، وبالهاتف للضيف */
  async function personal(limit) {
    try {
      const d = await fetchRecs({ limit: limit || 4 });
      return d && d.recommendations ? d.recommendations : [];
    } catch (e) { return []; }
  }

  global.Basit = global.Basit || {};
  global.Basit.Recs = {
    getPhone, getRemembered, remember, preload,
    isBought, timesBought, getHomeSections, forCart, forProduct, personal,
  };
})(window);
