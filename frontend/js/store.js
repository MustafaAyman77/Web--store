/* ==========================================================================
   أسواق البسيط — Store (إعدادات المتجر المركزية)
   --------------------------------------------------------------------------
   - المصدر الوحيد: GET /api/store + GET /api/delivery-zones (تُجلب مرة واحدة).
   - بدون Backend: قيم افتراضية آمنة (تصفح + طلب محلي كما قبل).
   ========================================================================== */
(function (global) {
  "use strict";

  const DEFAULTS = {
    storeName: "أسواق البسيط",
    storeAddress: "",
    storePhone: "",
    storeWhatsapp: "",
    storeDescription: "",
    storeLogo: "",
    storeOpen247: true,
    ordersEnabled: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    minimumOrderAmount: 0,
    freeDeliveryThreshold: 0,
    estimatedPreparationMinutes: 0,
    customerOrderNote: "",
    maintenanceMode: false,
  };

  const state = { loaded: false, store: { ...DEFAULTS }, zones: [] };
  let pending = null;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  async function fetchJson(path) {
    const res = await fetch(base() + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    if (!data || !data.success) throw new Error("bad payload");
    return data.data;
  }

  async function load() {
    try {
      const [store, zones] = await Promise.all([
        fetchJson("/api/store"),
        fetchJson("/api/delivery-zones").catch(() => ({ zones: [] })),
      ]);
      state.store = { ...DEFAULTS, ...(store || {}) };
      state.zones = (zones && zones.zones) || [];
    } catch (e) {
      state.store = { ...DEFAULTS }; // الوضع المحلي — كل شيء متاح
      state.zones = [];
    }
    state.loaded = true;
    paintHeader();
    return state;
  }

  function ensure() {
    if (state.loaded) return Promise.resolve(state);
    if (!pending) pending = load().finally(() => { pending = null; });
    return pending;
  }

  async function refresh() {
    state.loaded = false;
    pending = null;
    return ensure();
  }

  function get() { return state.store; }
  function zones() { return state.zones; }
  function zoneById(id) { return state.zones.find((z) => z.id === id) || null; }

  /** عرض سعر من السيرفر — نفس حساب الإنشاء (للعرض فقط، والنهائي عند التأكيد) */
  async function quote(items, fulfillmentMethod, deliveryZoneId) {
    const res = await fetch(base() + "/api/orders/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items, fulfillmentMethod, deliveryZoneId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const err = new Error((data.error && data.error.message) || "تعذر حساب الإجمالي.");
      err.code = data.error && data.error.code;
      throw err;
    }
    return data.data;
  }

  /** حالة المتجر في الهيدر — من الإعدادات الحقيقية وليس نصًا ثابتًا */
  function paintHeader() {
    document.querySelectorAll(".open-pill").forEach((pill) => {
      const s = state.store;
      if (s.maintenanceMode) {
        pill.innerHTML = "🛠️ المتجر تحت الصيانة";
        return;
      }
      if (!s.ordersEnabled) {
        pill.innerHTML = '<i class="pulse-dot is-off" aria-hidden="true"></i> لا يستقبل الطلبات حاليًا';
        return;
      }
      if (s.storeOpen247) {
        pill.innerHTML = '<i class="pulse-dot" aria-hidden="true"></i> مفتوح 24 ساعة';
      } else {
        pill.innerHTML = '<i class="pulse-dot" aria-hidden="true"></i> مفتوح ويستقبل الطلبات';
      }
    });
  }

  /** بوابة الصيانة — تُستدعى من الإقلاع قبل رسم أي صفحة */
  function maintenanceGate() {
    if (!state.store.maintenanceMode) return false;
    document.body.innerHTML =
      '<main class="maint-page"><div class="maint-card">' +
      '<span class="maint-emoji" aria-hidden="true">🛠️</span>' +
      "<h1>المتجر تحت الصيانة حاليًا</h1>" +
      "<p>نعود للعمل قريبًا — شكرًا لصبرك.</p>" +
      '<a class="btn btn-primary" href="index.html">🔄 إعادة المحاولة</a>' +
      "</div></main>";
    document.title = "تحت الصيانة | أسواق البسيط";
    return true;
  }

  global.Basit = global.Basit || {};
  global.Basit.Store = { ensure, refresh, get, zones, zoneById, quote, paintHeader, maintenanceGate };
})(window);
