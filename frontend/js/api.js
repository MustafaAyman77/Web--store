/* ==========================================================================
   أسواق البسيط — Api (طبقة الاتصال بالـ Backend)
   --------------------------------------------------------------------------
   - mode "auto" (افتراضي): يفحص GET /api/health — لو السيرفر شغال يستخدمه،
     وإلا يعمل محليًا (Demo) — الواجهة لا تنكسر أبدًا.
   - "backend": إجبار الاتصال بالسيرفر | "demo": إجبار الوضع المحلي.
   - baseUrl فارغ = نفس الـ Origin (السيرفر يقدّم الواجهة من نفس البورت).
   ========================================================================== */
(function (global) {
  "use strict";

  function base() {
    return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
  }
  function url(path) {
    return base() + path;
  }

  let modeCache = null;

  /** فحص سريع: هل الـ Backend متاح؟ */
  async function checkHealth(timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || 2500);
      const res = await fetch(url("/api/health"), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.success);
    } catch (e) {
      return false;
    }
  }

  async function resolveMode() {
    const configured = global.BasitConfig.api.mode;
    if (configured === "demo") return "demo";
    if (configured === "backend") return "backend";
    if (modeCache) return modeCache; // auto
    modeCache = (await checkHealth(2500)) ? "backend" : "demo";
    return modeCache;
  }

  /** إعدادات عامة للواجهة (بدون أسرار) — null عند عدم التوفر */
  async function getPublicConfig() {
    try {
      const res = await fetch(url("/api/config"));
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.success ? data.data : null;
    } catch (e) {
      return null;
    }
  }

  /** تحويل صف المنتج من الـ API لشكل الواجهة الموحد */
  function mapProduct(p) {
    const base = Number(p.price);
    const hasPromo = !!(p.promotion && p.promotion.id);
    const final = (p.finalPrice !== null && p.finalPrice !== undefined) ? Number(p.finalPrice) : base;
    const legacyOld = (p.oldPrice !== null && p.oldPrice !== undefined) ? Number(p.oldPrice) : undefined;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      desc: p.description || "",
      price: final, // سعر البيع = النهائي بعد العرض (حقيقة الباك-إند)
      oldPrice: (hasPromo && final < base) ? base : legacyOld, // مشطوب + توفير تلقائي
      finalPrice: final,
      promotion: hasPromo ? { id: p.promotion.id, name: p.promotion.name, type: p.promotion.type, endsAt: p.promotion.endsAt || null } : null,
      discountPercent: Number(p.discountPercent) || 0,
      unit: p.unit || "",
      icon: p.image || "🛒",
      tint: Array.isArray(p.tint) && p.tint.length === 2 ? p.tint : ["#f1f5f9", "#e2e8f0"],
      available: (p.available !== false) && (p.purchasable !== false),
      outOfStock: p.stockStatus === "out_of_stock",
      lowStockQty: p.stockStatus === "low_stock" ? Number(p.stockQuantity) : 0,
      featured: !!p.featured,
      popularity: Number(p.popularity) || 0,
      added: 0,
      badge: p.badge && p.badge.text ? { text: p.badge.text, tone: p.badge.tone || "offer" } : undefined,
      isNew: !!p.isNew,
    };
  }

  /** جلب المنتجات — من الـ Backend أولًا، ومن البيانات المحلية عند تعذره */
  async function getProducts() {
    const mode = await resolveMode();
    if (mode === "backend") {
      const res = await fetch(url("/api/products"));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const products = ((data && data.data && data.data.products) || []).map(mapProduct);
      products.forEach((p, i) => { p.added = products.length - i; });
      if (!products.length) throw new Error("empty");
      // الأقسام من الـBackend — مع Fallback للثابتة عند التعذر (أوفلاين)
      let categories = global.BasitData.categories;
      try {
        const cr = await fetch(url("/api/categories"));
        if (cr.ok) {
          const cd = await cr.json();
          const list = cd && cd.data && cd.data.categories;
          if (Array.isArray(list) && list.length) {
            categories = list.map((c) => ({ id: c.slug || c.id, name: c.name, icon: c.image || c.icon || "\U0001F5C2\uFE0F" }));
          }
        }
      } catch (e) { /* fallback للثابتة */ }
      return { categories, products, offers: global.BasitData.offers };
    }
    return {
      categories: global.BasitData.categories,
      products: global.BasitData.products,
      offers: global.BasitData.offers,
    };
  }

  /**
   * إرسال الطلب — minimal: { items:[{productId,quantity}], customer, fulfillmentMethod, notes }
   * السيرفر هو من يحسب الأسعار والإجمالي — أي سعر من الواجهة يُتجاهل.
   */
  async function submitOrder(minimal) {
    const mode = await resolveMode();
    if (mode === "backend") {
      const timeoutMs = global.BasitConfig.api.timeoutMs || 12000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url("/api/orders"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(minimal),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.success) {
          return {
            ok: false,
            mode: "backend",
            code: (data && data.error && data.error.code) || "SUBMIT_FAILED",
            message: (data && data.error && data.error.message) || "تعذر إنشاء الطلب.",
          };
        }
        return {
          ok: true,
          mode: "backend",
          orderId: data.data.orderId,
          orderNo: data.data.orderNumber,
          total: data.data.total,
          status: data.data.status,
          deliveryFee: data.data.deliveryFee,
          deliveryZoneName: data.data.deliveryZoneName,
          fulfillmentMethod: data.data.fulfillmentMethod,
        };
      } catch (err) {
        clearTimeout(timer);
        return { ok: false, mode: "backend", code: "NETWORK_ERROR", message: "تعذر الاتصال بالسيرفر." };
      }
    }
    // وضع Demo المحلي (لا سيرفر) — يُستخدم فقط عند غياب الـ Backend
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { ok: true, mode: "demo", orderNo: global.Basit.Orders.generateOrderId() };
  }

  /** العروض النشطة من الـ Backend — null بدون سيرفر (تُستخدم الباقات التجريبية) */
  async function getPromotions() {
    const mode = await resolveMode();
    if (mode !== "backend") return null;
    const res = await fetch(url("/api/promotions"));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data && data.data ? data.data.promotions || [] : [];
  }

  async function getPromotion(id) {
    const mode = await resolveMode();
    if (mode !== "backend") return null;
    const res = await fetch(url("/api/promotions/" + encodeURIComponent(id)));
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.data ? data.data : null;
  }

  global.Basit = global.Basit || {};
  global.Basit.Api = {
    resolveMode,
    checkHealth,
    getPublicConfig,
    getProducts,
    getPromotions,
    getPromotion,
    mapProduct,
    submitOrder,
    resetModeCache() { modeCache = null; },
  };
})(window);
