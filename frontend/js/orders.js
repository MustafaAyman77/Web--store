/* ==========================================================================
   أسواق البسيط — Orders (طبقة تجهيز وإرسال الطلبات)
   --------------------------------------------------------------------------
   - createOrderPayload(): تجهيز Order Object محليًا (للعرض والمراجعة).
   - submitOrder(): الإرسال الحقيقي عبر Basit.Api → POST /api/orders عند توفر
     السيرفر (الأسعار تُحسب هناك)، أو حفظ Demo محلي عند غيابه.
   🔮 التدفق المستقبلي: Website → Backend API → Validate → Save → Notify.
   ========================================================================== */
(function (global) {
  "use strict";

  const LAST_KEY = "basitMarket_lastOrder";
  const LIST_KEY = "basitMarket_orders";
  const MAX_STORED_ORDERS = 20;

  /** حالات الطلب — نفس حالات الـ Backend (تُدار من السيرفر لاحقًا) */
  const STATUSES = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"];

  /* ================= رقم الطلب (وضع Demo فقط) ================= */

  let usedIds = null;
  const pad2 = (n) => (n < 10 ? "0" : "") + n;

  function collectUsedIds() {
    if (usedIds) return usedIds;
    usedIds = new Set();
    try {
      getOrders().forEach((o) => { if (o && o.orderId) usedIds.add(o.orderId); });
      const last = getLastOrder();
      if (last && last.orderId) usedIds.add(last.orderId);
    } catch (e) { /* تجاهل */ }
    return usedIds;
  }

  /** رقم طلب تجريبي فريد بصيغة BS-YYYYMMDD-XXXX — لا يتكرر داخل الجلسة */
  function generateOrderId() {
    const used = collectUsedIds();
    const d = new Date();
    const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    let id = "";
    let guard = 0;
    do {
      id = "BS-" + stamp + "-" + Math.floor(1000 + Math.random() * 9000);
      guard++;
    } while (used.has(id) && guard < 50);
    if (used.has(id)) id = "BS-" + stamp + "-" + String(Date.now()).slice(-6);
    used.add(id);
    return id;
  }

  /* ================= بناء الطلب محليًا (للعرض والمراجعة) ================= */

  function validPrice(n) {
    n = Number(n);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function buildItems() {
    const Data = global.BasitData;
    const lines = global.Basit.Cart.lines();
    if (!lines.length) return { ok: false, code: "EMPTY" };

    const items = [];
    for (const l of lines) {
      let price = 0;
      let name = "";
      if (l.kind === "offer") {
        const o = Data.getOffer(l.id);
        if (!o) return { ok: false, code: "INVALID" };
        price = validPrice(o.newPrice);
        name = o.name;
      } else {
        const p = Data.getProduct(l.id);
        if (!p) return { ok: false, code: "INVALID" };
        if (p.available === false) return { ok: false, code: "UNAVAILABLE", name: p.name };
        price = validPrice(p.price);
        name = p.name;
      }
      if (!price) return { ok: false, code: "INVALID" };
      const qty = Math.floor(Number(l.qty)) || 0;
      if (qty < 1) return { ok: false, code: "INVALID" };
      items.push({
        productId: l.id,
        kind: l.kind,
        name,
        quantity: qty,
        price,
        subtotal: price * qty,
      });
    }
    return { ok: true, items };
  }

  function createOrderPayload(input) {
    input = input || {};
    const built = buildItems();
    if (!built.ok) return built;

    const subtotal = built.items.reduce((s, it) => s + it.subtotal, 0);
    const c = input.customer || {};
    const orderId = generateOrderId();
    return {
      ok: true,
      payload: {
        orderId,
        orderNumber: orderId, // في وضع الـ Backend يُستبدل برقم السيرفر
        createdAt: new Date().toISOString(),
        customer: {
          name: String(c.name || ""),
          phone: String(c.phone || ""),
          address: String(c.address || ""),
          area: String(c.area || ""),
          landmark: String(c.landmark || ""),
        },
        items: built.items,
        subtotal,
        deliveryFee: null,
        total: subtotal,
        fulfillmentMethod: input.fulfillmentMethod === "pickup" ? "pickup" : "delivery",
        notes: String(input.notes || ""),
        status: "new",
      },
    };
  }

  /* ================= التخزين المحلي (Demo + نسخة عرض) ================= */

  function getOrders() {
    try {
      const raw = localStorage.getItem(LIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function getLastOrder() {
    try {
      const raw = localStorage.getItem(LAST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function persistOrder(order) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(order)); } catch (e) { /* تجاهل */ }
    try {
      const list = getOrders();
      list.unshift(order);
      localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, MAX_STORED_ORDERS)));
    } catch (e) { /* تجاهل */ }
  }

  /* ================= الإرسال ================= */

  async function submitOrder(payload) {
    const Api = global.Basit.Api;
    const mode = await Api.resolveMode();

    if (mode === "backend") {
      // نرسل الحد الأدنى فقط — السيرفر يحسب الأسعار من قاعدة البيانات
      const minimal = {
        items: payload.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        customer: payload.customer,
        fulfillmentMethod: payload.fulfillmentMethod,
        notes: payload.notes,
      };
      const res = await Api.submitOrder(minimal);
      if (res && res.ok) {
        const order = {
          ...payload,
          orderId: res.orderId || payload.orderId,
          orderNumber: res.orderNo || payload.orderId,
          status: res.status || "new",
          serverTotal: res.total,
          mode: "backend",
        };
        persistOrder(order);
        return { ok: true, order, mode: "backend" };
      }
      return { ok: false, code: res.code, error: res.message };
    }

    // وضع Demo المحلي — لا سيرفر متاح
    persistOrder({ ...payload, mode: "demo" });
    return { ok: true, order: { ...payload, mode: "demo" }, mode: "demo" };
  }

  /* ================= عرض الوقت بصيغة مفهومة ================= */

  function formatOrderTime(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d)) return "";
      const h = d.getHours();
      const period = h < 12 ? "ص" : "م";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const time = "الساعة " + h12 + ":" + pad2(d.getMinutes()) + " " + period;
      const now = new Date();
      const sameDay = d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      return sameDay
        ? "تم الطلب اليوم " + time
        : "تم الطلب بتاريخ " + d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear() + " " + time;
    } catch (e) { return ""; }
  }

  global.Basit = global.Basit || {};
  global.Basit.Orders = {
    STATUSES,
    LAST_KEY,
    LIST_KEY,
    generateOrderId,
    createOrderPayload,
    submitOrder,
    getOrders,
    getLastOrder,
    formatOrderTime,
  };
})(window);
