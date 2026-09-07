/* ==========================================================================
   أسواق البسيط — Orders (طبقة تجهيز وإرسال الطلبات)
   --------------------------------------------------------------------------
   📦 مسؤولة فقط عن: بناء Order Object + توليد رقم الطلب + الحفظ/الإرسال.
   - createOrderPayload(): تجهيز بيانات الطلب من السلة (بدون إرسال).
   - submitOrder(): إرسال الطلب — وضع Demo حاليًا، وBackend لاحقًا
     دون أي تغيير في صفحة Checkout.
   🛡️ سلامة الأسعار: يُعاد قراءة كل سعر من مصدر البيانات المركزي
   (BasitData) وقت إنشاء الطلب — وليس من الواجهة.
   🔮 التدفق المستقبلي (لا يُنفَّذ الآن):
   Customer → Website → Backend API → Validate → Save → Telegram Bot → Store
   ========================================================================== */
(function (global) {
  "use strict";

  const LAST_KEY = "basitMarket_lastOrder";
  const LIST_KEY = "basitMarket_orders";
  const MAX_STORED_ORDERS = 20;

  /** حالات الطلب — قابلة للتوسع مستقبلًا (ستُدار من الـ Backend لاحقًا) */
  const STATUSES = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"];

  /* ================= رقم الطلب ================= */

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

  /** رقم طلب فريد بصيغة BP-YYYYMMDD-XXXX — لا يتكرر داخل الجلسة */
  function generateOrderId() {
    const used = collectUsedIds();
    const d = new Date();
    const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    let id = "";
    let guard = 0;
    do {
      id = "BP-" + stamp + "-" + Math.floor(1000 + Math.random() * 9000);
      guard++;
    } while (used.has(id) && guard < 50);
    if (used.has(id)) id = "BP-" + stamp + "-" + String(Date.now()).slice(-6);
    used.add(id);
    return id;
  }

  /* ================= بناء الطلب ================= */

  function validPrice(n) {
    n = Number(n);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * إعادة بناء أصناف السلة من مصدر البيانات المركزي مع التحقق.
   * @returns {ok:true, items} أو {ok:false, code:"EMPTY"|"UNAVAILABLE"|"INVALID"}
   */
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

  /**
   * تجهيز Order Object كامل — جاهز للإرسال للـ Backend لاحقًا.
   * input: { customer:{name,phone,address,area,landmark}, fulfillmentMethod, notes }
   */
  function createOrderPayload(input) {
    input = input || {};
    const built = buildItems();
    if (!built.ok) return built;

    const subtotal = built.items.reduce((s, it) => s + it.subtotal, 0);
    const c = input.customer || {};
    return {
      ok: true,
      payload: {
        orderId: generateOrderId(),
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
        deliveryFee: null, // لا يوجد سعر توصيل في النسخة التجريبية
        total: subtotal,
        fulfillmentMethod: input.fulfillmentMethod === "pickup" ? "pickup" : "delivery",
        notes: String(input.notes || ""),
        status: "new",
      },
    };
  }

  /* ================= التخزين التجريبي ================= */

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

  function persistDemoOrder(payload) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(payload)); } catch (e) { /* تجاهل */ }
    try {
      const list = getOrders();
      list.unshift(payload);
      localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, MAX_STORED_ORDERS)));
    } catch (e) { /* تجاهل */ }
  }

  /* ================= الإرسال ================= */

  function submitOrder(payload) {
    // المسار المستقبلي: عبر Backend فقط (وهو من يرسل لـ Telegram)
    if (global.BasitConfig.api.mode === "backend") {
      return global.Basit.Api.submitOrder(payload).then((res) => {
        if (res && res.ok) {
          if (res.orderNo) payload.orderId = res.orderNo;
          persistDemoOrder(payload);
          return { ok: true, order: payload, mode: "backend" };
        }
        return { ok: false, error: (res && res.error) || "submit-failed" };
      });
    }
    // المسار الحالي: Demo محلي فقط — لا يُرسل أي شيء لأي مكان
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          persistDemoOrder(payload);
          resolve({ ok: true, order: payload, mode: "demo" });
        } catch (e) {
          resolve({ ok: false, error: String((e && e.message) || e) });
        }
      }, 900);
    });
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
