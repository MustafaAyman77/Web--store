/* ==========================================================================
   أسواق البسيط — Account (صفحة حسابي account.html فقط)
   ?view=home|orders|order&n=..|profile — للمسجلين فقط (الضيف يُحوَّل للدخول).
   ========================================================================== */
(function (global) {
  "use strict";

  const STATUS = {
    new: "🆕 تم الاستلام",
    confirmed: "✅ تم التأكيد",
    preparing: "👨‍🍳 جاري التجهيز",
    ready: "📦 جاهز للاستلام",
    out_for_delivery: "🚚 في الطريق إليك",
    completed: "🎉 تم التسليم",
    cancelled: "❌ ملغي",
  };
  const STEPS = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];
  let pollTimer = null;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  async function api(path, opts) {
    const res = await fetch(base() + path, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...(opts || {}),
    });
    if (res.status === 401) {
      location.href = "login.html?next=" + encodeURIComponent("account.html" + location.search);
      throw new Error("unauthorized");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error((data.error && data.error.message) || "حدث خطأ — حاول مرة أخرى.");
    }
    return data.data;
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function esc(s) { return global.Basit.UI.esc(s); }
  function fmtPrice(v) { return global.Basit.UI.fmtPrice(v); }
  function fmtDate(ts) {
    if (!ts) return "";
    try {
      return new Date(String(ts).replace(" ", "T") + "Z").toLocaleString("ar-EG", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
    } catch (e) { return String(ts); }
  }

  function tabs(active) {
    const items = [
      ["home", "👋 حسابي", "account.html"],
      ["orders", "🧾 طلباتي", "account.html?view=orders"],
      ["notifications", "🔔 الإشعارات", "account.html?view=notifications"],
      ["profile", "📋 بياناتي", "account.html?view=profile"],
    ];
    return '<nav class="acc-tabs" aria-label="أقسام الحساب">' +
      items.map(([v, label, href]) =>
        '<a href="' + href + '" class="acc-tab' + (v === active ? " is-active" : "") + '"' +
        (v === active ? ' aria-current="page"' : "") + ">" + label + "</a>"
      ).join("") +
      "</nav>";
  }

  function statusChip(st) {
    return '<span class="acc-status st-' + esc(st || "new") + '">' + esc(STATUS[st] || st || "") + "</span>";
  }

  function orderCard(o) {
    return '<a class="acc-order-card" href="account.html?view=order&n=' + encodeURIComponent(o.orderNumber) + '">' +
      "<div><strong>#" + esc(o.orderNumber) + "</strong>" +
      '<p class="acc-muted">' + esc(fmtDate(o.createdAt)) + " • " + (o.itemsCount || 0) + " قطعة • " +
      (o.fulfillmentMethod === "pickup" ? "🏪 استلام" : "🚚 توصيل") + "</p></div>" +
      "<div>" + statusChip(o.status) + '<p class="acc-total">' + fmtPrice(o.total) + "</p></div>" +
      "</a>";
  }

  /* ================= الرئيسية ================= */

  async function renderHome(root, me) {
    const first = String(me.name || "").split(" ")[0] || "صديقنا";
    root.innerHTML = tabs("home") +
      '<section class="acc-hero"><h1>👋 أهلًا بك يا ' + esc(first) + "</h1>" +
      "<p>طلباتك وبياناتك وترشيحاتك — كلها في مكان واحد.</p></section>" +
      '<section id="accLast"></section>' +
      '<section class="acc-grid" id="accShortcuts">' +
      '<a class="acc-tile" href="account.html?view=orders">🧾<b>طلباتي</b><small>' + (me.totalOrders || 0) + " طلب</small></a>" +
      '<a class="acc-tile" href="account.html?view=profile">📋<b>بياناتي</b><small>العنوان والتواصل</small></a>' +
      '<a class="acc-tile" href="products.html">🛒<b>تسوّق</b><small>كل المنتجات</small></a>' +
      "</section>" +
      '<section id="accRecent"></section>' +
      '<section id="accRecs"></section>';
    loadLastOrder();
    loadRecent();
    loadRecs();
  }

  async function loadLastOrder() {
    const box = document.getElementById("accLast");
    if (!box) return;
    try {
      const d = await api("/api/me/orders?limit=1");
      if (!d.orders.length) {
        box.innerHTML = '<section class="acc-card"><h2>🧾 آخر طلب</h2><p class="acc-muted">لا توجد طلبات بعد — <a href="products.html">ابدأ التسوق 🛒</a></p></section>';
        return;
      }
      box.innerHTML = '<section class="acc-card"><h2>🧾 آخر طلب</h2>' + orderCard(d.orders[0]) +
        '<a class="btn btn-outline btn-block" href="account.html?view=orders">عرض كل الطلبات</a></section>';
    } catch (e) { /* تجاهل */ }
  }

  async function loadRecent() {
    const box = document.getElementById("accRecent");
    if (!box) return;
    try {
      const d = await api("/api/me/orders?limit=2");
      if (!d.orders.length) return;
      const seen = new Set();
      const ids = [];
      for (const o of d.orders.slice(0, 2)) {
        try {
          const det = await api("/api/me/orders/" + encodeURIComponent(o.orderNumber));
          (det.items || []).forEach((it) => {
            if (it.productId && !seen.has(it.productId)) { seen.add(it.productId); ids.push(it.productId); }
          });
        } catch (e) { /* تجاهل */ }
      }
      const cards = ids.slice(0, 6).map((id) => {
        const p = global.BasitData.getProduct(id);
        if (!p || p.available === false) return "";
        return '<div class="acc-recent-item"><span class="acc-recent-icon" aria-hidden="true">' + esc(p.icon || p.image || "🛒") + "</span>" +
          '<div><b>' + esc(p.name) + "</b><p>" + fmtPrice(p.price) + "</p></div>" +
          '<button type="button" class="add-btn" data-add-product="' + esc(p.id) + '">＋ أضف</button></div>';
      }).join("");
      if (cards) {
        box.innerHTML = '<section class="acc-card"><h2>🕘 آخر ما اشتريته</h2><div class="acc-recent">' + cards + "</div></section>";
      }
    } catch (e) { /* تجاهل */ }
  }

  async function loadRecs() {
    const box = document.getElementById("accRecs");
    if (!box || !global.Basit.Recs) return;
    const list = await global.Basit.Recs.personal(4);
    if (!list.length) return;
    box.innerHTML = '<section class="acc-card"><h2>👋 ممكن يعجبك</h2>' +
      '<div class="rec-grid rec-grid-sm">' + list.map(global.Basit.UI.recCardHTML).join("") + "</div></section>";
  }

  /* ================= قائمة الطلبات ================= */

  async function renderOrders(root) {
    root.innerHTML = tabs("orders") + '<section class="acc-card"><h1>🧾 طلباتي</h1><div id="accOrdersList"><p class="acc-muted">جاري التحميل...</p></div></section>';
    const box = document.getElementById("accOrdersList");
    try {
      const d = await api("/api/me/orders?limit=20");
      box.innerHTML = d.orders.length
        ? d.orders.map(orderCard).join("")
        : '<p class="acc-muted">لا توجد طلبات بعد — <a href="products.html">ابدأ التسوق 🛒</a></p>';
    } catch (e) {
      if (e.message !== "unauthorized") box.innerHTML = '<p class="acc-error">' + esc(e.message) + "</p>";
    }
  }

  /* ================= تفاصيل الطلب ================= */

  function timeline(order) {
    if (order.status === "cancelled") {
      return '<div class="acc-cancelled">❌ هذا الطلب ملغي — لو محتاج المنتجات اطلبها من جديد من <a href="products.html">المنتجات</a>.</div>';
    }
    const steps = order.fulfillmentMethod === "pickup"
      ? ["new", "confirmed", "preparing", "ready", "completed"]
      : STEPS;
    const idx = steps.indexOf(order.status);
    return '<ol class="acc-timeline">' + steps.map((s, i) => {
      const cls = i < idx ? "is-done" : i === idx ? "is-now" : "";
      const mark = i < idx ? "✓" : i === idx ? "●" : "○";
      return '<li class="' + cls + '"><span aria-hidden="true">' + mark + "</span> " + esc(STATUS[s]) + "</li>";
    }).join("") + "</ol>";
  }

  async function renderOrder(root, orderNumber) {
    root.innerHTML = tabs("orders") + '<section class="acc-card" id="accOrderBox"><p class="acc-muted">جاري التحميل...</p></section>';
    const paint = async () => {
      try {
        const o = await api("/api/me/orders/" + encodeURIComponent(orderNumber));
        const box = document.getElementById("accOrderBox");
        if (!box) return;
        box.innerHTML =
          '<p><a href="account.html?view=orders">→ رجوع لطلباتي</a></p>' +
          "<h1>طلب #" + esc(o.orderNumber) + "</h1>" +
          '<div id="accOrderStatus">' + statusChip(o.status) + "</div>" +
          '<p class="acc-muted">' + esc(fmtDate(o.createdAt)) + " • " +
          (o.fulfillmentMethod === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل") + "</p>" +
          '<p class="acc-muted">🕘 آخر تحديث: ' + esc(ago(o.updatedAt || o.createdAt)) + "</p>" +
          '<div id="accOrderTimeline">' + timeline(o) + "</div>" +
          historyHTML(o.statusHistory) +
          '<div class="acc-items">' +
          o.items.map((it) =>
            '<div class="summary-line"><span>' + esc(it.name) + " × " + it.quantity + "</span><b>" + fmtPrice(it.subtotal) + "</b></div>"
          ).join("") +
          '<div class="summary-line"><span>الإجمالي الفرعي</span><b>' + fmtPrice(o.subtotal) + "</b></div>" +
          (o.deliveryFee != null ? '<div class="summary-line"><span>التوصيل</span><b>' + fmtPrice(o.deliveryFee) + "</b></div>" : "") +
          '<div class="summary-total"><span>الإجمالي</span><output>' + fmtPrice(o.total) + "</output></div>" +
          "</div>" +
          (o.status !== "cancelled"
            ? '<button type="button" class="btn btn-primary btn-block" id="accReorder">🔁 إعادة الطلب</button>' +
              '<p class="acc-muted acc-note">تُضاف المنتجات المتاحة حاليًا بالأسعار الحالية.</p>'
            : "") +
          '<a class="btn btn-outline btn-block" href="products.html">🛒 متابعة التسوق</a>';
        const rb = document.getElementById("accReorder");
        if (rb) rb.addEventListener("click", () => reorder(o));
        // إيقاف التحديث عند الحالات النهائية
        if (o.status === "completed" || o.status === "cancelled") stopPolling();
      } catch (e) {
        if (e.message === "unauthorized") return;
        const box = document.getElementById("accOrderBox");
        if (box) box.innerHTML = '<p class="acc-error">' + esc(e.message) + '</p><p><a href="account.html?view=orders">→ رجوع لطلباتي</a></p>';
        stopPolling();
      }
    };
    await paint();
    // تحديث تلقائي كل 45 ثانية داخل صفحة الطلب فقط
    stopPolling();
    pollTimer = setInterval(paint, 45000);
  }

  function historyHTML(hist) {
    if (!hist || !hist.length) return "";
    return '<div class="track-history"><h3>🕘 تطور الطلب</h3><ul>' +
      hist.map((h) =>
        "<li><b>" + esc(STATUS[h.status] || h.status) + "</b><span>" + esc(fmtDate(h.createdAt)) + "</span></li>"
      ).join("") + "</ul></div>";
  }

  function reorder(order) {
    const UI = global.Basit.UI;
    const Cart = global.Basit.Cart;
    let added = 0;
    let skipped = 0;
    (order.items || []).forEach((it) => {
      // فحص التوفر الحالي أولًا (البيانات من /api/products = حالة الـDB الآن)
      const p = global.BasitData.getProduct(it.productId);
      if (!p || p.available === false || p.outOfStock === true) { skipped += 1; return; }
      // السلة تستخدم السعر الحالي من الـDB — السعر القديم لا يُستخدم أبدًا
      const r = Cart.add("product", it.productId, it.quantity);
      if (r === "added") added += 1;
      else skipped += 1;
    });
    UI.updateBadges();
    if (added && !skipped) {
      UI.toast("✅ اتضافت منتجات الطلب للسلة بالأسعار الحالية", "🛒");
      UI.openDrawer();
    } else if (added && skipped) {
      UI.toast("⚠️ بعض المنتجات لم تعد متاحة حاليًا — اتضاف المتاح فقط", "🛒");
      UI.openDrawer();
    } else {
      UI.toast("هذا المنتج غير متوفر حاليًا", "⚠️");
    }
  }

  /* ================= الإشعارات ================= */

  function ago(ts) {
    try {
      const ms = Date.now() - new Date(String(ts).replace(" ", "T") + "Z").getTime();
      if (!Number.isFinite(ms) || ms < 0) return "";
      const m = Math.floor(ms / 60000);
      if (m < 1) return "منذ لحظات";
      if (m < 60) return "منذ " + m + " دقيقة";
      const h = Math.floor(m / 60);
      if (h < 24) return "منذ " + h + " ساعة";
      return "منذ " + Math.floor(h / 24) + " يوم";
    } catch (e) { return ""; }
  }

  async function renderNotifications(root) {
    root.innerHTML = tabs("notifications") +
      '<section class="acc-card"><div class="notif-head"><h1>🔔 الإشعارات</h1>' +
      '<button type="button" class="link-btn" id="notifReadAll">تحديد الكل كمقروء</button></div>' +
      '<div id="notifList"><div class="notif-skel"></div><div class="notif-skel"></div><div class="notif-skel"></div></div></section>';
    const box = document.getElementById("notifList");
    const load = async () => {
      box.innerHTML = '<div class="notif-skel"></div><div class="notif-skel"></div><div class="notif-skel"></div>';
      try {
        const d = await api("/api/notifications?limit=20");
        if (!d.notifications.length) {
          box.innerHTML = '<div class="notif-empty"><span aria-hidden="true">🔔</span><p>لا توجد إشعارات جديدة.</p></div>';
          return;
        }
        box.innerHTML = d.notifications.map((n) =>
          '<button type="button" class="notif-item' + (n.isRead ? "" : " is-unread") + '" data-notif="' + esc(n.id) + '" data-order="' + esc(n.orderNumber || "") + '">' +
            "<b>" + esc(n.title) + "</b><p>" + esc(n.message) + "</p>" +
            '<small class="acc-muted">' + esc(ago(n.createdAt)) + "</small>" +
          "</button>"
        ).join("");
        box.querySelectorAll("[data-notif]").forEach((el) => {
          el.addEventListener("click", async () => {
            try { await api("/api/notifications/" + encodeURIComponent(el.dataset.notif) + "/read", { method: "PATCH" }); } catch (e) { /* تجاهل */ }
            if (global.Basit.Notif) global.Basit.Notif.refresh();
            if (el.dataset.order) location.href = "account.html?view=order&n=" + encodeURIComponent(el.dataset.order);
            else load();
          });
        });
      } catch (e) {
        if (e.message === "unauthorized") return;
        box.innerHTML = '<div class="notif-empty"><p>تعذر تحميل الإشعارات.</p>' +
          '<button type="button" class="btn btn-outline" id="notifRetry">حاول مرة أخرى</button></div>';
        document.getElementById("notifRetry").addEventListener("click", load);
      }
    };
    document.getElementById("notifReadAll").addEventListener("click", async () => {
      try {
        await api("/api/notifications/read-all", { method: "PATCH" });
        if (global.Basit.Notif) global.Basit.Notif.refresh();
        load();
      } catch (e) { if (e.message !== "unauthorized") global.Basit.UI.toast(e.message, "⚠️"); }
    });
    await load();
  }

  /* ================= البيانات ================= */

  async function renderProfile(root, me) {
    root.innerHTML = tabs("profile") +
      '<section class="acc-card"><h1>📋 بياناتي</h1>' +
      '<div class="auth-alert" id="accAlert" role="alert" hidden></div>' +
      '<form id="accForm" novalidate>' +
      '<div class="auth-field"><label for="accName">الاسم بالكامل</label><input id="accName" type="text" maxlength="100" value="' + esc(me.name || "") + '" /></div>' +
      '<div class="auth-field"><label for="accPhone">رقم الهاتف</label><input id="accPhone" type="tel" dir="ltr" value="' + esc(me.phone || "") + '" disabled /><small class="acc-muted">تغيير الهاتف يحتاج تحققًا جديدًا — تواصل مع المحل.</small></div>' +
      '<div class="auth-field"><label for="accEmail">البريد الإلكتروني (اختياري)</label><input id="accEmail" type="email" dir="ltr" maxlength="120" value="' + esc(me.email || "") + '" /></div>' +
      '<div class="auth-field"><label for="accAddress">العنوان الافتراضي للتوصيل</label><input id="accAddress" type="text" maxlength="300" value="' + esc(me.address || "") + '" /></div>' +
      '<div class="auth-field"><label for="accArea">المنطقة</label><input id="accArea" type="text" maxlength="100" value="' + esc(me.area || "") + '" /></div>' +
      '<div class="auth-field"><label for="accLandmark">علامة مميزة</label><input id="accLandmark" type="text" maxlength="200" value="' + esc(me.landmark || "") + '" /></div>' +
      '<button type="submit" class="btn btn-primary btn-block">💾 حفظ البيانات</button>' +
      "</form></section>" +
      '<section class="acc-card"><h2>⚙️ الحساب</h2>' +
      '<button type="button" class="btn btn-outline btn-block" id="accLogout">🚪 تسجيل الخروج</button>' +
      '<button type="button" class="btn btn-danger-outline btn-block" id="accDeactivate">🗑️ إلغاء الحساب</button>' +
      '<p class="acc-muted acc-note">إلغاء الحساب يعطّله فقط — طلباتك القديمة تظل محفوظة، ويمكنك الدخول مرة أخرى بنفس الرقم في أي وقت.</p>' +
      "</section>";

    const say = (msg, ok) => {
      const box = document.getElementById("accAlert");
      box.hidden = false;
      box.textContent = msg;
      box.classList.toggle("is-ok", !!ok);
    };

    document.getElementById("accForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api("/api/me/profile", {
          method: "PATCH",
          body: JSON.stringify({
            name: document.getElementById("accName").value.trim(),
            email: document.getElementById("accEmail").value.trim(),
            address: document.getElementById("accAddress").value.trim(),
            area: document.getElementById("accArea").value.trim(),
            landmark: document.getElementById("accLandmark").value.trim(),
          }),
        });
        await global.Basit.Auth.refresh();
        say("تم حفظ بياناتك بنجاح ✅", true);
      } catch (err) {
        if (err.message !== "unauthorized") say(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("accLogout").addEventListener("click", async () => {
      await global.Basit.Auth.logout();
      location.href = "index.html";
    });

    document.getElementById("accDeactivate").addEventListener("click", async () => {
      const ok = global.confirm("متأكد إنك عايز تلغي حسابك؟\nطلباتك القديمة هتفضل محفوظة، وتقدر تدخل تاني بنفس الرقم في أي وقت.");
      if (!ok) return;
      try {
        await api("/api/me/deactivate", { method: "POST" });
        await global.Basit.Auth.refresh();
        location.href = "index.html";
      } catch (err) {
        if (err.message !== "unauthorized") say(err.message);
      }
    });
  }

  /* ================= الدخول ================= */

  async function init() {
    stopPolling();
    const root = document.getElementById("accountRoot");
    if (!root) return;
    root.innerHTML = '<p class="acc-muted">جاري التحميل...</p>';
    const me = await global.Basit.Auth.ensure();
    if (!me) {
      location.href = "login.html?next=" + encodeURIComponent("account.html" + location.search);
      return;
    }
    const qs = new URLSearchParams(location.search);
    const view = qs.get("view") || "home";
    try {
      if (view === "orders") await renderOrders(root);
      else if (view === "order" && qs.get("n")) await renderOrder(root, qs.get("n"));
      else if (view === "notifications") await renderNotifications(root);
      else if (view === "profile") await renderProfile(root, me);
      else await renderHome(root, me);
    } catch (e) { /* الحارس أعلاه يتعامل مع 401 */ }
  }

  global.Basit = global.Basit || {};
  global.Basit.Account = { init };
  document.addEventListener("pagehide", stopPolling);
})(window);
