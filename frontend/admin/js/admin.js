/* ==========================================================================
   لوحة تحكم أسواق البسيط — Admin SPA (Vanilla JS)
   مسارات حقيقية: /admin/ /admin/login /admin/orders ... مع Auth من الـBackend.
   ========================================================================== */
(function () {
  "use strict";

  const TOKEN_KEY = "basit_admin_token";
  const view = document.getElementById("adView");
  const header = document.getElementById("adHeader");
  const bottomNav = document.getElementById("adBottomNav");

  /* ================= أدوات ================= */

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const fmtPrice = (n) => Number(n || 0).toLocaleString("en-US") + " ج.م";

  function fmtDT(sqliteUtc) {
    try {
      const d = new Date(String(sqliteUtc).replace(" ", "T") + "Z");
      if (isNaN(d)) return "—";
      return d.toLocaleString("ar-EG", {
        timeZone: "Africa/Cairo",
        day: "numeric", month: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    } catch { return "—"; }
  }

  function toast(msg, isErr) {
    const wrap = document.getElementById("adToasts");
    const el = document.createElement("div");
    el.className = "ad-toast" + (isErr ? " err" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /** نافذة تأكيد — تُرجع Promise<boolean> */
  function confirmDlg(title, message, okText, danger) {
    return new Promise((resolve) => {
      const root = document.getElementById("adModalRoot");
      root.innerHTML =
        '<div class="ad-modal-back"><div class="ad-modal" role="alertdialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        "<h2>" + esc(title) + "</h2><p>" + esc(message) + "</p>" +
        '<div class="ad-modal-actions">' +
        '<button type="button" class="ad-btn ' + (danger ? "ad-btn-danger" : "ad-btn-primary") + '" id="cfOk">' + esc(okText || "تأكيد") + "</button>" +
        '<button type="button" class="ad-btn ad-btn-outline" id="cfNo">تراجع</button>' +
        "</div></div></div>";
      const close = (v) => { root.innerHTML = ""; resolve(v); };
      document.getElementById("cfOk").addEventListener("click", () => close(true));
      document.getElementById("cfNo").addEventListener("click", () => close(false));
      root.querySelector(".ad-modal-back").addEventListener("click", (e) => {
        if (e.target.classList.contains("ad-modal-back")) close(false);
      });
    });
  }

  /** نافذة نموذج — تُرجع form element عند الحفظ أو null عند الإلغاء */
  function formModal(title, fieldsHTML, saveText) {
    return new Promise((resolve) => {
      const root = document.getElementById("adModalRoot");
      root.innerHTML =
        '<div class="ad-modal-back"><div class="ad-modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        "<h2>" + esc(title) + "</h2>" +
        '<form class="ad-form" id="mdForm">' + fieldsHTML +
        '<div class="ad-form-error" id="mdErr" role="alert"></div>' +
        '<div class="ad-modal-actions">' +
        '<button type="submit" class="ad-btn ad-btn-primary" id="mdSave">' + esc(saveText || "حفظ") + "</button>" +
        '<button type="button" class="ad-btn ad-btn-outline" id="mdCancel">تراجع</button>' +
        "</div></form></div></div>";
      const close = (v) => { root.innerHTML = ""; resolve(v); };
      document.getElementById("mdForm").addEventListener("submit", (e) => {
        e.preventDefault();
        resolve(document.getElementById("mdForm"));
      });
      document.getElementById("mdCancel").addEventListener("click", () => close(null));
      root.querySelector(".ad-modal-back").addEventListener("click", (e) => {
        if (e.target.classList.contains("ad-modal-back")) close(null);
      });
    });
  }
  function modalError(msg) {
    const el = document.getElementById("mdErr");
    if (el) { el.textContent = msg; el.classList.add("show"); }
  }
  function closeModal() { document.getElementById("adModalRoot").innerHTML = ""; }

  /* ================= API ================= */

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} };
  const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

  async function api(path, { method, body } = {}) {
    const res = await fetch("/api" + path, {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearToken();
      if (!location.pathname.startsWith("/admin/login")) location.href = "/admin/login";
      throw { code: "UNAUTHORIZED", message: "انتهت الجلسة — سجّل الدخول مجددًا." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      throw { code: (data && data.error && data.error.code) || "FAILED", message: (data && data.error && data.error.message) || "حدث خطأ." };
    }
    return data.data;
  }

  /* ================= ثوابت العرض ================= */

  const STATUS = {
    new: { t: "جديد 🆕", c: "st-new" },
    confirmed: { t: "مؤكد ✅", c: "st-confirmed" },
    preparing: { t: "قيد التجهيز 👨‍🍳", c: "st-preparing" },
    ready: { t: "جاهز ✅", c: "st-ready" },
    out_for_delivery: { t: "خارج للتوصيل 🛵", c: "st-out_for_delivery" },
    completed: { t: "مكتمل ✔️", c: "st-completed" },
    cancelled: { t: "ملغي ❌", c: "st-cancelled" },
  };
  const stBadge = (s) => {
    const m = STATUS[s] || { t: s, c: "st-cancelled" };
    return '<span class="st ' + m.c + '">' + esc(m.t) + "</span>";
  };

  const FILTERS = [
    ["", "الكل 📋"], ["new", "الجديدة 🆕"], ["confirmed", "المؤكدة ✅"],
    ["preparing", "قيد التجهيز 👨‍🍳"], ["ready", "جاهزة ✅"],
    ["out_for_delivery", "خرجت للتوصيل 🛵"], ["completed", "مكتملة ✔️"], ["cancelled", "ملغاة ❌"],
  ];

  const FALLBACK_CATS = [
    ["beverages", "🥤 المشروبات"], ["snacks", "🍫 السناكس والحلويات"],
    ["dairy", "🥛 الألبان"], ["grocery", "🛒 البقالة"],
    ["cleaning", "🧹 المنظفات"], ["care", "🧴 العناية الشخصية"],
    ["frozen", "🧊 المجمدات"], ["home", "🏠 مستلزمات المنزل"],
    ["offers", "🎁 عروض مجمعة"],
  ];
  let ADMIN_CATS = null;
  async function getCats() {
    if (ADMIN_CATS) return ADMIN_CATS;
    try {
      const d = await api("/admin/categories");
      ADMIN_CATS = (d.categories || []).map((c) => [c.slug || c.id, (c.image || c.icon || "🗂️") + " " + c.name]);
      if (!ADMIN_CATS.length) ADMIN_CATS = FALLBACK_CATS;
    } catch { ADMIN_CATS = FALLBACK_CATS; }
    return ADMIN_CATS;
  }
  const catName = (id) => ((ADMIN_CATS || FALLBACK_CATS).find((c) => c[0] === id) || ["", id])[1];

  const PFILTERS = [
    ["", "كل المنتجات 📋"], ["available", "متاحة 🟢"], ["unavailable", "غير متاحة 🔴"],
    ["out_of_stock", "نفدت ⛔"], ["low_stock", "مخزون منخفض ⚠️"],
    ["offer", "عروض 🔥"], ["featured", "منتجات مميزة ⭐"],
  ];
  const PSORTS = [
    ["", "الأكثر شعبية"], ["newest", "الأحدث"], ["oldest", "الأقدم"],
    ["price_asc", "السعر: من الأقل"], ["price_desc", "السعر: من الأعلى"],
    ["stock_desc", "الأكثر مخزونًا"], ["stock_asc", "الأقل مخزونًا"],
  ];
  const MOVT = {
    purchase: "🛒 استلام بضاعة", sale: "🧾 بيع", manual_add: "➕ إضافة يدوية",
    manual_remove: "➖ خصم يدوي", correction: "🧮 جرد/تصحيح", cancel_restore: "↩️ إلغاء طلب",
  };
  const fulfillName = (m) => (m === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل");

  function stockBadge(p) {
    if (!p.stockTracking) return '<span class="ad-stock">بدون تتبع</span>';
    const s = Number(p.stockQuantity);
    if (p.stockStatus === "out_of_stock" || s <= 0) return '<span class="ad-stock out">🔴 نفد المخزون (0)</span>';
    if (p.stockStatus === "low_stock") return '<span class="ad-stock low">⚠️ المخزون: ' + s + " (الحد: " + (p.lowStockThreshold ?? 5) + ")</span>";
    return '<span class="ad-stock ok">المخزون: ' + s + "</span>";
  }
  function availBadge(p) {
    if (p.stockStatus === "out_of_stock") return '<span class="st st-ontg-failed">🔴 نفد المخزون</span>';
    return p.available ? '<span class="st st-completed">🟢 متاح</span>' : '<span class="st st-cancelled">🔴 غير متاح</span>';
  }
  function productImage(p) {
    const img = p.image || "📦";
    if (/^(https?:\/\/|\/|data:image)/.test(img)) return '<img class="ad-product-img" src="' + esc(img) + '" alt="" loading="lazy" />';
    return esc(img);
  }

  function tgBadge(t) {
    if (t === "sent") return '<span class="st st-ontg-sent">TG: تم ✅</span>';
    if (t === "failed") return '<span class="st st-ontg-failed">TG: فشل ⚠️</span>';
    if (t === "disabled") return '<span class="st st-ontg-disabled">TG: معطّل</span>';
    return '<span class="st st-ontg-disabled">TG: ' + esc(t || "—") + "</span>";
  }

  /* ================= حالات العرض ================= */

  const skel = (n) => Array.from({ length: n || 4 }, () => '<div class="ad-skel"></div>').join("");
  const stateHTML = (icon, title, msg, btn) =>
    '<div class="ad-state"><span class="big">' + icon + "</span><h2>" + esc(title) + "</h2><p>" + esc(msg) + "</p>" + (btn || "") + "</div>";

  function pagerHTML(page, total, limit, base) {
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) return "";
    const q = (p) => base + (base.includes("?") ? "&" : "?") + "page=" + p;
    return '<div class="ad-pager">' +
      '<button type="button" data-goto="' + esc(q(page - 1)) + '" ' + (page <= 1 ? "disabled" : "") + ' aria-label="السابق">→</button>' +
      "<span>صفحة " + page + " من " + pages + " (" + total + ")</span>" +
      '<button type="button" data-goto="' + esc(q(page + 1)) + '" ' + (page >= pages ? "disabled" : "") + ' aria-label="التالي">←</button>' +
      "</div>";
  }

  /* ================= التنقل ================= */

  function navigate(path) {
    history.pushState(null, "", path);
    render();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-link]");
    if (link) { e.preventDefault(); navigate(link.getAttribute("href")); return; }
    const goto = e.target.closest("[data-goto]");
    if (goto && !goto.disabled) navigate(goto.dataset.goto);
  });
  window.addEventListener("popstate", render);

  function setChrome(route) {
    const logged = route !== "login";
    header.hidden = !logged;
    bottomNav.hidden = !logged;
    document.querySelectorAll("[data-route]").forEach((a) =>
      a.classList.toggle("is-active", a.dataset.route === route));
  }

  /* ================= الجرس (طلبات جديدة) ================= */

  async function updateBell() {
    const badge = document.getElementById("adBellCount");
    if (!badge || !getToken()) return;
    try {
      const d = await api("/admin/dashboard");
      badge.textContent = d.newOrders;
      badge.hidden = !(d.newOrders > 0);
    } catch { /* تجاهل — يُعاد في الدورة التالية */ }
  }
  setInterval(() => {
    if (getToken() && !location.pathname.startsWith("/admin/login")) updateBell();
  }, 30000);

  /* ================= الصفحات ================= */

  async function pageLogin() {
    if (getToken()) { location.href = "/admin/"; return; }
    setChrome("login");
    document.title = "تسجيل الدخول | لوحة التحكم";
    view.innerHTML =
      '<div class="ad-login-wrap"><div class="ad-card ad-login-card">' +
      '<div class="ad-login-icon" aria-hidden="true">📊</div>' +
      "<h1>أسواق البسيط</h1><p>لوحة تحكم الإدارة</p>" +
      '<form class="ad-form" id="loginForm">' +
      '<div class="ad-form-error" id="loginErr" role="alert"></div>' +
      '<div class="ad-field"><label for="liUser">اسم المستخدم</label><input id="liUser" autocomplete="username" placeholder="admin" /></div>' +
      '<div class="ad-field"><label for="liPass">كلمة المرور</label><input id="liPass" type="password" autocomplete="current-password" placeholder="••••••••" /></div>' +
      '<button type="submit" class="ad-btn ad-btn-primary ad-btn-block" id="loginBtn">تسجيل الدخول</button>' +
      "</form></div></div>";

    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("loginBtn");
      const err = document.getElementById("loginErr");
      err.classList.remove("show");
      btn.disabled = true;
      btn.innerHTML = '<span class="ad-spinner"></span> جاري الدخول...';
      try {
        const data = await api("/admin/login", {
          method: "POST",
          body: { username: document.getElementById("liUser").value.trim(), password: document.getElementById("liPass").value },
        });
        setToken(data.token);
        location.href = "/admin/";
      } catch (ex) {
        err.textContent = ex.message || "بيانات الدخول غير صحيحة.";
        err.classList.add("show");
        btn.disabled = false;
        btn.textContent = "تسجيل الدخول";
      }
    });
  }

  async function pageDashboard() {
    setChrome("dashboard");
    document.title = "الرئيسية | لوحة التحكم";
    view.innerHTML = '<div class="ad-page-head"><div><h1>👋 أهلًا بيك</h1><p>نظرة سريعة على المحل النهاردة.</p></div></div>' + skel(3);
    updateBell();
    try {
      const [d, recent] = await Promise.all([
        api("/admin/dashboard"),
        api("/admin/orders?limit=5"),
      ]);
      const lowAlert = (d.restockCount > 0)
        ? '<a class="ad-alert" data-link href="/admin/inventory"><span>⚠️</span><span>⚠️ ' + d.restockCount + " منتجات تحتاج إعادة تخزين" +
          (d.lowStock && d.lowStock.length ? ": " + d.lowStock.slice(0, 3).map((p) => esc(p.name) + " (" + p.stock + ")").join("، ") : "") +
          " ←</span></a>"
        : "";
      view.innerHTML =
        '<div class="ad-page-head"><div><h1>👋 أهلًا بيك</h1><p>نظرة سريعة على المحل النهاردة.</p></div>' +
        '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" id="dashRefresh">🔄 تحديث</button></div>' +
        lowAlert +
        '<div class="ad-stat-grid">' +
        '<a class="ad-card ad-stat hot" data-link href="/admin/orders?status=new"><span class="n">' + d.newOrders + '</span><span class="l">🆕 طلبات جديدة</span></a>' +
        '<a class="ad-card ad-stat" data-link href="/admin/orders?status=preparing"><span class="n">' + d.preparingOrders + '</span><span class="l">👨‍🍳 قيد التجهيز</span></a>' +
        '<a class="ad-card ad-stat" data-link href="/admin/orders?status=ready"><span class="n">' + d.readyOrders + '</span><span class="l">✅ جاهزة</span></a>' +
        '<a class="ad-card ad-stat" data-link href="/admin/orders?status=completed"><span class="n">' + d.completedOrders + '</span><span class="l">✔️ مكتملة</span></a>' +
        '<div class="ad-card ad-stat"><span class="n">' + d.todayOrders + '</span><span class="l">🧾 طلبات اليوم</span></div>' +
        '<div class="ad-card ad-stat money"><span class="n">' + fmtPrice(d.todayRevenue) + '</span><span class="l">💰 إيراد اليوم</span></div>' +
        '<a class="ad-card ad-stat" data-link href="/admin/orders?status=out_for_delivery"><span class="n">' + d.outForDeliveryOrders + '</span><span class="l">🛵 خارج للتوصيل</span></a>' +
        '<a class="ad-card ad-stat" data-link href="/admin/orders?status=cancelled"><span class="n">' + d.cancelledOrders + '</span><span class="l">❌ ملغاة</span></a>' +
        "</div>" +
        '<h2 class="ad-section-title">🕐 آخر الطلبات</h2>' +
        '<div class="ad-list">' +
        (recent.orders.length
          ? recent.orders.map((o) =>
            '<a class="ad-card ad-row-card" data-link href="/admin/orders/' + esc(o.orderNumber) + '">' +
            '<div class="ad-row-top"><strong>🛒 ' + esc(o.orderNumber) + "</strong>" + stBadge(o.status) + "</div>" +
            '<div class="ad-row-meta"><span>👤 <b>' + esc(o.customerName) + "</b></span><span>💰 <b>" + fmtPrice(o.total) + "</b></span><span>🕐 " + esc(fmtDT(o.createdAt)) + "</span></div>" +
            "</a>").join("")
          : stateHTML("🛒", "لا توجد طلبات بعد", "الطلبات الجديدة هتظهر هنا أول بأول.")) +
        "</div>";
      document.getElementById("dashRefresh").addEventListener("click", () => pageDashboard());
    } catch (ex) {
      view.innerHTML = stateHTML("⚠️", "حدث خطأ أثناء تحميل البيانات", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageDashboard());
    }
  }

  async function pageOrders() {
    setChrome("orders");
    document.title = "الطلبات | لوحة التحكم";
    const qs = new URLSearchParams(location.search);
    const status = qs.get("status") || "";
    const search = qs.get("search") || "";
    const page = Math.max(1, Number(qs.get("page")) || 1);

    view.innerHTML =
      '<div class="ad-page-head"><div><h1>🧾 الطلبات</h1><p>تابع كل طلبات المحل لحظة بلحظة.</p></div></div>' +
      '<div class="ad-toolbar"><div class="ad-search"><span aria-hidden="true">🔎</span>' +
      '<label class="ad-field" style="display:none" for="ordSearch">بحث</label>' +
      '<input id="ordSearch" placeholder="ابحث برقم الطلب أو الاسم أو الهاتف..." value="' + esc(search) + '" />' +
      "</div></div>" +
      '<div class="ad-chips" role="tablist">' +
      FILTERS.map(([v, l]) => '<button type="button" role="tab" data-f="' + v + '" class="' + (v === status ? "is-active" : "") + '">' + esc(l) + "</button>").join("") +
      '</div><div class="ad-list" id="ordList">' + skel(4) + "</div><div id='ordPager'></div>";

    const go = (patch) => {
      const nq = new URLSearchParams(location.search);
      Object.entries(patch).forEach(([k, v]) => { if (!v) nq.delete(k); else nq.set(k, v); });
      navigate("/admin/orders" + (nq.toString() ? "?" + nq : ""));
    };

    let timer = null;
    document.getElementById("ordSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => go({ search: e.target.value.trim(), page: "" }), 400);
    });
    view.querySelectorAll("[data-f]").forEach((b) =>
      b.addEventListener("click", () => go({ status: b.dataset.f, page: "" })));

    try {
      const q = new URLSearchParams({ limit: "15", page: String(page) });
      if (status) q.set("status", status);
      if (search) q.set("search", search);
      const data = await api("/admin/orders?" + q);
      const list = document.getElementById("ordList");
      list.innerHTML = data.orders.length
        ? data.orders.map((o) =>
          '<article class="ad-card ad-row-card">' +
          '<div class="ad-row-top"><strong>🛒 ' + esc(o.orderNumber) + "</strong><span>" + stBadge(o.status) + " " + tgBadge(o.telegramStatus) + "</span></div>" +
          '<div class="ad-row-meta"><span>👤 <b>' + esc(o.customerName) + "</b></span><span>📞 <b dir='ltr'>" + esc(o.customerPhone) + "</b></span>" +
          "<span>📦 " + o.itemsCount + " قطعة</span><span>💰 <b>" + fmtPrice(o.total) + "</b></span>" +
          "<span>" + esc(fulfillName(o.fulfillmentMethod)) + "</span><span>🕐 " + esc(fmtDT(o.createdAt)) + "</span></div>" +
          '<div class="ad-row-actions"><a class="ad-btn ad-btn-primary ad-btn-sm" data-link href="/admin/orders/' + esc(o.orderNumber) + '">عرض الطلب ←</a></div>' +
          "</article>").join("")
        : stateHTML("🛒", status ? "لا توجد طلبات بهذه الحالة" : "لا توجد طلبات", search ? "جرّب كلمة بحث مختلفة." : "الطلبات الجديدة هتظهر هنا أول بأول.");
      const base = "/admin/orders?" + (() => { const b = new URLSearchParams(); if (status) b.set("status", status); if (search) b.set("search", search); b.set("limit", "15"); return b.toString(); })();
      document.getElementById("ordPager").innerHTML = pagerHTML(data.page, data.total, data.limit, base);
    } catch (ex) {
      document.getElementById("ordList").innerHTML = stateHTML("⚠️", "حدث خطأ أثناء تحميل الطلبات", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageOrders());
    }
  }

  async function pageOrderDetails(ref) {
    setChrome("orders");
    document.title = "تفاصيل الطلب | لوحة التحكم";
    view.innerHTML = '<a class="ad-back" data-link href="/admin/orders">→ رجوع للطلبات</a>' + skel(3);
    try {
      const o = await api("/admin/orders/" + encodeURIComponent(ref));
      const next = [o.status, ...(o.allowedNext || [])];
      view.innerHTML =
        '<a class="ad-back" data-link href="/admin/orders">→ رجوع للطلبات</a>' +
        '<div class="ad-page-head"><div><h1>🛒 ' + esc(o.orderNumber) + "</h1><p>🕐 " + esc(fmtDT(o.createdAt)) + "</p></div>" +
        "<div>" + stBadge(o.status) + " " + tgBadge(o.telegram && o.telegram.status) + "</div></div>" +
        '<div class="ad-detail-grid cols-2">' +
        '<section class="ad-card"><h2>👤 العميل</h2>' +
        '<div class="ad-kv"><span class="k">الاسم</span><span class="v">' + esc(o.customer.name) + "</span></div>" +
        '<div class="ad-kv"><span class="k">الهاتف</span><span class="v" dir="ltr">' + esc(o.customer.phone) + "</span></div>" +
        (o.fulfillmentMethod === "delivery"
          ? '<div class="ad-kv"><span class="k">العنوان</span><span class="v">' + esc(o.customer.address || "—") + "</span></div>" +
            '<div class="ad-kv"><span class="k">المنطقة</span><span class="v">' + esc(o.customer.area || "—") + "</span></div>" +
            '<div class="ad-kv"><span class="k">علامة مميزة</span><span class="v">' + esc(o.customer.landmark || "—") + "</span></div>"
          : '<div class="ad-kv"><span class="k">الاستلام</span><span class="v">🏪 استلام من المحل</span></div>') +
        "</section>" +
        '<section class="ad-card"><h2>🔄 حالة الطلب</h2>' +
        '<div class="ad-kv"><span class="k">الحالية</span><span class="v">' + stBadge(o.status) + "</span></div>" +
        ((o.allowedNext && o.allowedNext.length)
          ? '<div class="ad-field" style="margin-top:.6rem"><label for="stSel">تغيير الحالة</label>' +
            '<select id="stSel">' + next.map((s) => '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + esc((STATUS[s] || {}).t || s) + "</option>").join("") + "</select></div>" +
            '<button type="button" class="ad-btn ad-btn-primary ad-btn-block" id="stSave" style="margin-top:.6rem">💾 حفظ الحالة</button>'
          : '<p style="color:var(--muted);font-size:.88rem;margin-top:.5rem">🔒 حالة نهائية — لا يمكن تغييرها.</p>') +
        "</section>" +
        '<section class="ad-card"><h2>🛍️ المنتجات (' + o.items.reduce((s, it) => s + it.quantity, 0) + " قطعة)</h2>" +
        o.items.map((it) =>
          '<div class="ad-kv"><span class="k">' + esc(it.name) + " × " + it.quantity + "</span><span class='v'>" + fmtPrice(it.subtotal) + " <small style='color:var(--faint)'>(" + fmtPrice(it.price) + ")</small></span></div>").join("") +
        '<div class="ad-kv"><span class="k">المجموع الفرعي</span><span class="v">' + fmtPrice(o.subtotal) + "</span></div>" +
        '<div class="ad-kv"><span class="k">التوصيل</span><span class="v">' + (o.deliveryFee === null ? "—" : fmtPrice(o.deliveryFee)) + "</span></div>" +
        '<div class="ad-kv"><span class="k">💰 الإجمالي</span><span class="v" style="color:var(--brand-700);font-size:1.15rem">' + fmtPrice(o.total) + "</span></div>" +
        (o.notes ? '<div class="ad-kv"><span class="k">📌 ملاحظات</span><span class="v">' + esc(o.notes) + "</span></div>" : "") +
        "</section>" +
        '<section class="ad-card"><h2>📨 إشعار Telegram</h2>' +
        '<div class="ad-kv"><span class="k">الحالة</span><span class="v">' + tgBadge(o.telegram && o.telegram.status) + "</span></div>" +
        (o.telegram && o.telegram.error ? '<div class="ad-kv"><span class="k">الخطأ</span><span class="v" style="font-size:.8rem">' + esc(o.telegram.error) + "</span></div>" : "") +
        '<button type="button" class="ad-btn ad-btn-outline ad-btn-block" id="tgRetry" style="margin-top:.6rem">🔁 إعادة إرسال الإشعار</button>' +
        "</section></div>";

      const saveBtn = document.getElementById("stSave");
      if (saveBtn) saveBtn.addEventListener("click", async () => {
        const to = document.getElementById("stSel").value;
        if (to === o.status) { toast("الحالة لم تتغير"); return; }
        const label = (STATUS[to] || {}).t || to;
        const ok = to === "cancelled"
          ? await confirmDlg("إلغاء الطلب؟", "هل أنت متأكد من إلغاء الطلب " + o.orderNumber + "؟ سيُعاد المخزون المخصوم تلقائيًا.", "نعم، إلغاء", true)
          : await confirmDlg("تغيير الحالة؟", "نقل الطلب " + o.orderNumber + " إلى: " + label, "حفظ");
        if (!ok) return;
        saveBtn.disabled = true;
        try {
          const r = await api("/admin/orders/" + encodeURIComponent(o.orderNumber) + "/status", { method: "PATCH", body: { status: to } });
          toast("✅ تم تحديث الحالة إلى: " + label + (r.stockRestored ? " (أُعيد المخزون ↩️)" : ""));
          pageOrderDetails(o.orderNumber);
        } catch (ex) {
          toast(ex.message || "تعذر تحديث الحالة", true);
          saveBtn.disabled = false;
        }
      });

      document.getElementById("tgRetry").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await api("/admin/orders/" + encodeURIComponent(o.orderNumber) + "/telegram/retry", { method: "POST", body: {} });
          toast(r.sent ? "✅ تم إرسال الإشعار" : r.reason === "already-sent" ? "تم إرساله من قبل ✔️" : "تعذر الإرسال: " + (r.reason || ""), !r.sent && r.reason !== "already-sent");
          pageOrderDetails(o.orderNumber);
        } catch (ex) {
          toast(ex.message || "تعذر الإرسال", true);
          btn.disabled = false;
        }
      });
    } catch (ex) {
      view.innerHTML = '<a class="ad-back" data-link href="/admin/orders">→ رجوع للطلبات</a>' +
        stateHTML("⚠️", "تعذر تحميل الطلب", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageOrderDetails(ref));
    }
  }

  async function pageProducts() {
    setChrome("products");
    document.title = "المنتجات | لوحة التحكم";
    const qs = new URLSearchParams(location.search);
    const search = qs.get("search") || "";
    const category = qs.get("category") || "";
    const status = qs.get("status") || "";
    const sort = qs.get("sort") || "";
    const page = Math.max(1, Number(qs.get("page")) || 1);
    const cats = await getCats();

    view.innerHTML =
      '<div class="ad-page-head"><div><h1>📦 المنتجات</h1><p>الأسعار والمخزون والتوفر من مكان واحد.</p></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><a class="ad-btn ad-btn-outline ad-btn-sm" data-link href="/admin/categories">🗂️ الأقسام</a>' +
      '<a class="ad-btn ad-btn-primary ad-btn-sm" data-link href="/admin/products/new">＋ منتج جديد</a></div></div>' +
      '<div class="ad-toolbar"><div class="ad-search"><span aria-hidden="true">🔎</span><input id="pSearch" placeholder="ابحث باسم المنتج أو القسم..." value="' + esc(search) + '" /></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
      '<select id="pCat" class="ad-btn ad-btn-outline ad-btn-sm" style="min-height:50px;flex:1" aria-label="فلترة حسب القسم">' +
      '<option value="">كل الأقسام</option>' + cats.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === category ? " selected" : "") + ">" + esc(l) + "</option>").join("") +
      "</select>" +
      '<select id="pSort" class="ad-btn ad-btn-outline ad-btn-sm" style="min-height:50px;flex:1" aria-label="ترتيب">' +
      PSORTS.map(([v, l]) => '<option value="' + v + '"' + (v === sort ? " selected" : "") + ">" + esc(l) + "</option>").join("") +
      "</select></div></div>" +
      '<div class="ad-chips" role="tablist">' +
      PFILTERS.map(([v, l]) => '<button type="button" role="tab" data-f="' + v + '" class="' + (v === status ? "is-active" : "") + '">' + esc(l) + "</button>").join("") +
      '</div><div class="ad-bulkbar" id="bulkBar" hidden><span>✅ تم تحديد <b id="bulkCount">0</b></span>' +
      '<button type="button" class="ad-btn ad-btn-primary ad-btn-sm" id="bulkOn">تفعيل المحدد</button>' +
      '<button type="button" class="ad-btn ad-btn-danger ad-btn-sm" id="bulkOff">تعطيل المحدد</button></div>' +
      '<div class="ad-list" id="pList">' + skel(4) + "</div><div id='pPager'></div>";

    const go = (patch) => {
      const nq = new URLSearchParams(location.search);
      Object.entries(patch).forEach(([k, v]) => { if (!v) nq.delete(k); else nq.set(k, v); });
      navigate("/admin/products" + (nq.toString() ? "?" + nq : ""));
    };
    let timer = null;
    document.getElementById("pSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => go({ search: e.target.value.trim(), page: "" }), 400);
    });
    document.getElementById("pCat").addEventListener("change", (e) => go({ category: e.target.value, page: "" }));
    document.getElementById("pSort").addEventListener("change", (e) => go({ sort: e.target.value, page: "" }));
    view.querySelectorAll("[data-f]").forEach((b) =>
      b.addEventListener("click", () => go({ status: b.dataset.f, page: "" })));

    async function bulkAct(action) {
      const ids = [...view.querySelectorAll("[data-pick]:checked")].map((c) => c.dataset.pick);
      if (!ids.length) return;
      try {
        const r = await api("/admin/products/bulk", { method: "PATCH", body: { ids, action } });
        toast("✅ تم تحديث " + r.updated + " منتج");
        pageProducts();
      } catch (ex) { toast(ex.message || "تعذر التنفيذ", true); }
    }
    document.getElementById("bulkOn").addEventListener("click", () => bulkAct("activate"));
    document.getElementById("bulkOff").addEventListener("click", async () => {
      const n = view.querySelectorAll("[data-pick]:checked").length;
      const ok = await confirmDlg("تعطيل منتجات؟", "سيتم إيقاف " + n + " منتج من البيع مؤقتًا.", "تعطيل", true);
      if (ok) bulkAct("deactivate");
    });

    try {
      const q = new URLSearchParams({ limit: "20", page: String(page) });
      if (search) q.set("search", search);
      if (category) q.set("category", category);
      if (status) q.set("status", status);
      if (sort) q.set("sort", sort);
      const data = await api("/admin/products?" + q);
      document.getElementById("pList").innerHTML = data.products.length
        ? data.products.map((p) =>
          '<article class="ad-card ad-row-card' + (p.available ? "" : " is-off") + '">' +
          '<div class="ad-row-top"><label class="ad-pick"><input type="checkbox" data-pick="' + esc(p.id) + '" aria-label="تحديد ' + esc(p.name) + '" /></label>' +
          '<strong><span class="ad-product-emoji" aria-hidden="true">' + productImage(p) + "</span> " + esc(p.name) + "</strong>" +
          "<span>" + availBadge(p) +
          (p.offer ? ' <span class="st st-preparing">🔥 عرض</span>' : "") +
          (p.featured ? ' <span class="st st-out_for_delivery">⭐ مميز</span>' : "") + "</span></div>" +
          '<div class="ad-row-meta"><span>' + esc(catName(p.category)) + "</span><span>💰 <b>" + fmtPrice(p.price) + "</b></span>" +
          (p.oldPrice && p.oldPrice > p.price ? "<span>بدلًا من <s>" + fmtPrice(p.oldPrice) + '</s> <b class="ad-off">خصم ' + (p.discountPercent || 0) + "%</b></span>" : "") +
          "<span>" + stockBadge(p) + "</span></div>" +
          '<div class="ad-row-actions">' +
          '<a class="ad-btn ad-btn-outline ad-btn-sm" data-link href="/admin/products/' + esc(p.id) + '/edit">✏️ تعديل</a>' +
          '<a class="ad-btn ad-btn-outline ad-btn-sm" data-link href="/admin/inventory/' + esc(p.id) + '">📦 المخزون</a>' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-toggle="' + esc(p.id) + '" data-av="' + (p.available ? "1" : "0") + '">' + (p.available ? "⏸️ إيقاف" : "▶️ تفعيل") + "</button>" +
          '<button type="button" class="ad-btn ad-btn-ghost ad-btn-sm" data-del="' + esc(p.id) + '" data-name="' + esc(p.name) + '">🗑️ حذف</button>' +
          "</div></article>").join("")
        : stateHTML("📦", "لا توجد منتجات", (search || category || status) ? "جرّب بحثًا أو فلترًا مختلفًا." : "أضف أول منتج من زر «منتج جديد».");
      const bq = new URLSearchParams();
      if (search) bq.set("search", search);
      if (category) bq.set("category", category);
      if (status) bq.set("status", status);
      if (sort) bq.set("sort", sort);
      bq.set("limit", "20");
      document.getElementById("pPager").innerHTML = pagerHTML(data.page, data.total, data.limit, "/admin/products?" + bq);

      const bulkBar = document.getElementById("bulkBar");
      view.querySelectorAll("[data-pick]").forEach((c) => c.addEventListener("change", () => {
        const n = view.querySelectorAll("[data-pick]:checked").length;
        bulkBar.hidden = n === 0;
        document.getElementById("bulkCount").textContent = n;
      }));

      view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
        const to = b.dataset.av === "1" ? false : true;
        if (!to) {
          const ok = await confirmDlg("إيقاف المنتج؟", "سيتوقف بيع هذا المنتج مؤقتًا ويمكن تفعيله لاحقًا.", "إيقاف", true);
          if (!ok) return;
        }
        b.disabled = true;
        try {
          await api("/admin/products/" + encodeURIComponent(b.dataset.toggle), { method: "PATCH", body: { available: to } });
          toast(to ? "✅ تم تفعيل المنتج" : "⏸️ تم إيقاف المنتج");
          pageProducts();
        } catch (ex) { toast(ex.message || "تعذر الحفظ", true); b.disabled = false; }
      }));
      view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const ok = await confirmDlg("حذف المنتج؟", "سيتم إيقاف «" + b.dataset.name + "» نهائيًا من البيع (الطلبات القديمة محفوظة).", "نعم، احذف", true);
        if (!ok) return;
        try {
          await api("/admin/products/" + encodeURIComponent(b.dataset.del), { method: "DELETE" });
          toast("🗑️ تم حذف المنتج");
          pageProducts();
        } catch (ex) { toast(ex.message || "تعذر الحذف", true); }
      }));
    } catch (ex) {
      document.getElementById("pList").innerHTML = stateHTML("⚠️", "حدث خطأ أثناء تحميل المنتجات", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageProducts());
    }
  }

  async function pageProductForm(id) {
    const isNew = !id;
    setChrome("products");
    document.title = (isNew ? "منتج جديد" : "تعديل منتج") + " | لوحة التحكم";
    view.innerHTML = '<a class="ad-back" data-link href="/admin/products">→ رجوع للمنتجات</a><div class="ad-card">' + skel(2) + "</div>";

    let p = null;
    try {
      const cats = await getCats();
      if (!isNew) {
        // عبر قائمة الإدارة (تشمل الموقوف — عكس الـAPI العام)
        const d = await api("/admin/products?search=" + encodeURIComponent(id) + "&limit=10");
        p = (d.products || []).find((x) => x.id === id) || null;
        if (!p) throw { message: "المنتج غير موجود." };
      }
      renderForm(cats);
    } catch (ex) {
      view.innerHTML = '<a class="ad-back" data-link href="/admin/products">→ رجوع للمنتجات</a>' +
        stateHTML("⚠️", "تعذر تحميل المنتج", ex.message || "");
      return;
    }

    function renderForm(cats) {
    const v = (k, d) => (p && p[k] !== null && p[k] !== undefined ? p[k] : (d === undefined ? "" : d));
    view.innerHTML =
      '<a class="ad-back" data-link href="/admin/products">→ رجوع للمنتجات</a>' +
      '<div class="ad-page-head"><div><h1>' + (isNew ? "＋ منتج جديد" : "✏️ تعديل: " + esc(p.name)) + "</h1></div></div>" +
      '<form class="ad-card ad-form" id="pForm" novalidate>' +
      '<div class="ad-form-error" id="pErr" role="alert"></div>' +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fName">اسم المنتج <i>*</i></label><input id="fName" value="' + esc(v("name")) + '" placeholder="مثال: بيبسي 330 مل" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fCat">القسم <i>*</i></label><select id="fCat">' + cats.map(([cv, l]) => '<option value="' + esc(cv) + '"' + (v("category") === cv ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select><span class='err'></span></div>" +
      "</div>" +
      '<div class="ad-field"><label for="fDesc">الوصف</label><textarea id="fDesc" placeholder="وصف قصير للمنتج...">' + esc(v("description", v("desc", ""))) + "</textarea></div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fPrice">السعر (جنيه) <i>*</i></label><input id="fPrice" type="number" min="0" step="0.5" value="' + esc(v("price")) + '" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fOld">السعر القديم (للعرض — ≥ السعر)</label><input id="fOld" type="number" min="0" step="0.5" value="' + esc(v("oldPrice", "")) + '" placeholder="اتركه فارغًا بدون عرض" /><span class="err"></span></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fUnit">الوحدة</label><input id="fUnit" value="' + esc(v("unit")) + '" placeholder="كانز / علبة / كيس..." /></div>' +
      '<div class="ad-field"><label for="fIcon">الصورة (إيموجي أو رابط)</label><input id="fIcon" value="' + esc(v("image", v("icon", ""))) + '" placeholder="🥤 أو https://..." maxlength="300" dir="ltr" style="text-align:right" /></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fStock">المخزون (رقم صحيح ≥ صفر)</label><input id="fStock" type="number" min="0" step="1" value="' + esc(v("stockQuantity", "")) + '" placeholder="فارغ = بدون مخزون" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fThr">حد المخزون المنخفض</label><input id="fThr" type="number" min="0" step="1" value="' + esc(v("lowStockThreshold", 5)) + '" placeholder="5" /><span class="err"></span></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fPop">الشعبية (0-100)</label><input id="fPop" type="number" min="0" max="100" step="1" value="' + esc(v("popularity", 50)) + '" /></div>' +
      '<div class="ad-field"><label for="fBadgeT">نص الشارة</label><input id="fBadgeT" value="' + esc(p && p.badge ? p.badge.text : "") + '" placeholder="خصم / جديد..." /></div>' +
      "</div>" +
      '<div class="ad-field"><label for="fBadgeTone">نوع الشارة</label><select id="fBadgeTone">' +
      [["", "بدون"], ["offer", "🔥 عرض"], ["hot", "⭐ الأكثر طلبًا"], ["new", "✨ جديد"]].map(([bv, l]) => '<option value="' + bv + '"' + ((p && p.badge && p.badge.tone) === bv ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>" +
      '<div class="ad-checks">' +
      '<label><input type="checkbox" id="fAvail" ' + (isNew || v("available", true) ? "checked" : "") + ' /> 🟢 المنتج متاح للبيع</label>' +
      '<label><input type="checkbox" id="fTrack" ' + (isNew || v("stockTracking", true) ? "checked" : "") + ' /> ☑ تتبع المخزون</label>' +
      '<label><input type="checkbox" id="fFeat" ' + (v("featured", false) ? "checked" : "") + ' /> ⭐ منتج مميز (الرئيسية)</label>' +
      '<label><input type="checkbox" id="fOffer" ' + (v("offer", false) ? "checked" : "") + ' /> 🔥 عليه عرض</label>' +
      "</div>" +
      '<button type="submit" class="ad-btn ad-btn-primary ad-btn-block" id="pSave">💾 ' + (isNew ? "إضافة المنتج" : "حفظ التعديلات") + "</button>" +
      "</form>";

    const fail = (input, msg) => {
      const w = input.closest(".ad-field");
      w.classList.add("invalid");
      w.querySelector(".err").textContent = msg;
    };
    const clearInvalid = () => view.querySelectorAll(".ad-field.invalid").forEach((w) => w.classList.remove("invalid"));

    document.getElementById("pForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      clearInvalid();
      const err = document.getElementById("pErr");
      err.classList.remove("show");
      const g = (fid) => document.getElementById(fid).value.trim();
      const price = Number(g("fPrice"));
      const oldRaw = g("fOld");
      const stockRaw = g("fStock");
      const thrRaw = g("fThr");

      let bad = false;
      if (g("fName").length < 2) { fail(document.getElementById("fName"), "اسم المنتج مطلوب."); bad = true; }
      if (!Number.isFinite(price) || price < 0) { fail(document.getElementById("fPrice"), "السعر يجب أن يكون رقمًا ≥ صفر."); bad = true; }
      if (oldRaw !== "" && (!Number.isFinite(Number(oldRaw)) || Number(oldRaw) < price)) { fail(document.getElementById("fOld"), "السعر القديم يجب أن يكون ≥ السعر الحالي."); bad = true; }
      if (stockRaw !== "" && (!Number.isInteger(Number(stockRaw)) || Number(stockRaw) < 0)) { fail(document.getElementById("fStock"), "المخزون رقم صحيح ≥ صفر."); bad = true; }
      if (thrRaw !== "" && (!Number.isInteger(Number(thrRaw)) || Number(thrRaw) < 0)) { fail(document.getElementById("fThr"), "الحد رقم صحيح ≥ صفر."); bad = true; }
      if (bad) return;

      const tracking = document.getElementById("fTrack").checked;
      const body = {
        name: g("fName"), category: document.getElementById("fCat").value,
        description: g("fDesc"), price,
        oldPrice: oldRaw === "" ? null : Number(oldRaw),
        unit: g("fUnit"), image: g("fIcon") || "🛒",
        stockQuantity: !tracking || stockRaw === "" ? null : Number(stockRaw),
        stockTracking: tracking,
        lowStockThreshold: thrRaw === "" ? 5 : Number(thrRaw),
        popularity: Number(document.getElementById("fPop").value) || 50,
        badgeText: g("fBadgeT"), badgeTone: document.getElementById("fBadgeTone").value,
        available: document.getElementById("fAvail").checked,
        featured: document.getElementById("fFeat").checked,
        offer: document.getElementById("fOffer").checked,
      };

      if (!isNew && Number(p.price) !== body.price) {
        const ok = await confirmDlg("تغيير السعر؟", "السعر سيتغير من " + p.price + " إلى " + body.price + " جنيه. الطلبات القديمة لن تتأثر. هل تريد حفظ السعر الجديد؟", "نعم، احفظ");
        if (!ok) return;
      }

      const btn = document.getElementById("pSave");
      btn.disabled = true;
      btn.innerHTML = '<span class="ad-spinner"></span> جاري الحفظ...';
      try {
        if (isNew) await api("/admin/products", { method: "POST", body });
        else await api("/admin/products/" + encodeURIComponent(id), { method: "PATCH", body });
        toast(isNew ? "✅ تمت إضافة المنتج" : "✅ تم حفظ التعديلات");
        navigate("/admin/products");
      } catch (ex) {
        err.textContent = ex.message || "تعذر الحفظ.";
        err.classList.add("show");
        btn.disabled = false;
        btn.textContent = isNew ? "💾 إضافة المنتج" : "💾 حفظ التعديلات";
      }
    });
    } // renderForm
  }

  /* ================= المخزون ================= */

  async function pageInventory() {
    setChrome("inventory");
    document.title = "المخزون | لوحة التحكم";
    view.innerHTML = '<div class="ad-page-head"><div><h1>📦 المخزون</h1><p>تابع الكميات وعدّلها بسجل كامل لكل حركة.</p></div>' +
      '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" id="invRefresh">🔄 تحديث</button></div>' + skel(3);
    const load = async () => {
      try {
        const d = await api("/admin/inventory");
        const card = (p, low) =>
          '<article class="ad-card ad-row-card">' +
          '<div class="ad-row-top"><strong><span class="ad-product-emoji" aria-hidden="true">' + productImage(p) + "</span> " + esc(p.name) + "</strong>" +
          (low ? '<span class="st st-preparing">⚠️ مخزون منخفض</span>' : '<span class="st st-ontg-failed">🔴 نفد المخزون</span>') + "</div>" +
          '<div class="ad-row-meta"><span>المخزون: <b>' + p.stock + "</b></span>" +
          (low ? "<span>الحد الأدنى: <b>" + p.threshold + "</b></span>" : "") +
          (!p.available ? "<span>🔴 موقوف من البيع</span>" : "") + "</div>" +
          '<div class="ad-row-actions"><a class="ad-btn ad-btn-primary ad-btn-sm" data-link href="/admin/inventory/' + esc(p.id) + '">' + (low ? "تعديل المخزون" : "إضافة مخزون") + " ←</a></div>" +
          "</article>";
        view.innerHTML =
          '<div class="ad-page-head"><div><h1>📦 المخزون</h1><p>تابع الكميات وعدّلها بسجل كامل لكل حركة.</p></div>' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" id="invRefresh">🔄 تحديث</button></div>' +
          '<div class="ad-stat-grid">' +
          '<div class="ad-card ad-stat"><span class="n">' + d.totalProducts + '</span><span class="l">📦 إجمالي المنتجات</span></div>' +
          '<div class="ad-card ad-stat"><span class="n">' + d.availableProducts + '</span><span class="l">🟢 منتجات متاحة</span></div>' +
          '<a class="ad-card ad-stat hot" data-link href="/admin/products?status=low_stock"><span class="n">' + d.lowStockCount + '</span><span class="l">⚠️ مخزون منخفض</span></a>' +
          '<a class="ad-card ad-stat" data-link href="/admin/products?status=out_of_stock"><span class="n">' + d.outOfStockCount + '</span><span class="l">🔴 نفدت</span></a>' +
          "</div>" +
          '<h2 class="ad-section-title">⚠️ مخزون منخفض (' + d.lowStockCount + ")</h2>" +
          '<div class="ad-list">' + (d.lowStock.length ? d.lowStock.map((p) => card(p, true)).join("") : stateHTML("✅", "لا يوجد مخزون منخفض", "كل المنتجات فوق الحد الأدنى. 🎉")) + "</div>" +
          '<h2 class="ad-section-title">🔴 نفد المخزون (' + d.outOfStockCount + ")</h2>" +
          '<div class="ad-list">' + (d.outOfStock.length ? d.outOfStock.map((p) => card(p, false)).join("") : stateHTML("✅", "لا توجد منتجات نافذة", "كل المنتجات متوفرة. 🎉")) + "</div>";
        document.getElementById("invRefresh").addEventListener("click", () => pageInventory());
      } catch (ex) {
        view.innerHTML = stateHTML("⚠️", "تعذر تحميل المخزون", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
        document.getElementById("retryBtn").addEventListener("click", () => pageInventory());
      }
    };
    await load();
  }

  async function pageInventoryDetails(id) {
    setChrome("inventory");
    document.title = "مخزون المنتج | لوحة التحكم";
    view.innerHTML = '<a class="ad-back" data-link href="/admin/inventory">→ رجوع للمخزون</a>' + skel(3);
    try {
      const { product: p, history } = await api("/admin/inventory/" + encodeURIComponent(id));
      const cur = Number(p.stockQuantity) || 0;
      view.innerHTML =
        '<a class="ad-back" data-link href="/admin/inventory">→ رجوع للمخزون</a>' +
        '<div class="ad-page-head"><div><h1><span class="ad-product-emoji" aria-hidden="true">' + productImage(p) + "</span> " + esc(p.name) + '</h1><p>' + esc(catName(p.category)) + " • " + fmtPrice(p.price) + "</p></div><div>" + availBadge(p) + "</div></div>" +
        (p.stockTracking
          ? '<div class="ad-detail-grid cols-2">' +
            '<section class="ad-card"><h2>📦 المخزون الحالي</h2>' +
            '<p class="inv-big">' + cur + "</p>" +
            '<div class="ad-kv"><span class="k">الحالة</span><span class="v">' + stockBadge(p) + "</span></div>" +
            '<div class="ad-kv"><span class="k">الحد الأدنى</span><span class="v">' + (p.lowStockThreshold ?? 5) + "</span></div>" +
            '<a class="ad-btn ad-btn-outline ad-btn-sm" data-link href="/admin/products/' + esc(p.id) + '/edit" style="margin-top:.6rem">✏️ تعديل المنتج والحد</a>' +
            "</section>" +
            '<section class="ad-card"><h2>🔄 تعديل المخزون</h2>' +
            '<form class="ad-form" id="adjForm">' +
            '<div class="ad-form-error" id="adjErr" role="alert"></div>' +
            '<div class="ad-field"><label>نوع العملية</label><div class="ad-mode">' +
            '<label><input type="radio" name="mode" value="add" checked /> ＋ إضافة</label>' +
            '<label><input type="radio" name="mode" value="remove" /> − خصم</label>' +
            '<label><input type="radio" name="mode" value="set" /> ＝ ضبط على</label>' +
            "</div></div>" +
            '<div class="ad-field"><label for="adjQty">الكمية</label><input id="adjQty" type="number" min="0" step="1" value="1" /><span class="err"></span></div>' +
            '<div class="ad-field"><label for="adjReason">السبب</label><select id="adjReason">' +
            ["استلام بضاعة", "بيع يدوي", "تالف/منتهي", "جرد وتصحيح", "أخرى"].map((r) => "<option>" + r + "</option>").join("") +
            "</select></div>" +
            '<p class="ad-preview" id="adjPreview"></p>' +
            '<button type="submit" class="ad-btn ad-btn-primary ad-btn-block" id="adjSave">💾 تنفيذ العملية</button>' +
            "</form></section></div>"
          : stateHTML("📦", "تتبع المخزون معطّل", "فعّل تتبع المخزون من صفحة تعديل المنتج أولًا.", '<a class="ad-btn ad-btn-primary" data-link href="/admin/products/' + esc(p.id) + '/edit">تفعيل التتبع</a>')) +
        '<h2 class="ad-section-title">🧾 سجل الحركات</h2>' +
        '<div class="ad-list" id="movList">' +
        (history.length ? history.map((m) =>
          '<div class="ad-card ad-mov"><div><strong>' + esc(MOVT[m.type] || m.type) + "</strong>" +
          "<div class='ad-row-meta'><span>" + m.previousQuantity + " ← <b>" + m.newQuantity + "</b> (" + (m.newQuantity >= m.previousQuantity ? "+" : "") + (m.newQuantity - m.previousQuantity) + ")</span>" +
          (m.reason ? "<span>📌 " + esc(m.reason) + "</span>" : "") +
          (m.admin ? "<span>👤 " + esc(m.admin) + "</span>" : "") +
          "<span>🕐 " + esc(fmtDT(m.createdAt)) + "</span></div></div></div>").join("")
          : stateHTML("🧾", "لا توجد حركات بعد", "كل تعديل على المخزون سيُسجل هنا.")) +
        "</div>";

      const form = document.getElementById("adjForm");
      if (form) {
        const preview = () => {
          const mode = form.querySelector('input[name="mode"]:checked').value;
          const q = Math.max(0, Math.floor(Number(document.getElementById("adjQty").value) || 0));
          const next = mode === "add" ? cur + q : mode === "remove" ? cur - q : q;
          document.getElementById("adjPreview").textContent =
            mode === "add" ? cur + " + " + q + " = " + next : mode === "remove" ? cur + " − " + q + " = " + next : "ضبط المخزون على " + next;
        };
        form.addEventListener("input", preview);
        preview();
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const err = document.getElementById("adjErr");
          err.classList.remove("show");
          const mode = form.querySelector('input[name="mode"]:checked').value;
          const q = Math.floor(Number(document.getElementById("adjQty").value));
          if (!Number.isInteger(q) || q < 0 || (mode !== "set" && q < 1)) {
            err.textContent = "أدخل كمية صحيحة.";
            err.classList.add("show");
            return;
          }
          const next = mode === "add" ? cur + q : mode === "remove" ? cur - q : q;
          if (Math.abs(next - cur) >= 20) {
            const ok = await confirmDlg("تعديل كبير؟", "المخزون سيتغير من " + cur + " إلى " + next + " (فرق " + Math.abs(next - cur) + "). هل أنت متأكد؟", "نعم، نفّذ", true);
            if (!ok) return;
          }
          const btn = document.getElementById("adjSave");
          btn.disabled = true;
          btn.innerHTML = '<span class="ad-spinner"></span> جاري التنفيذ...';
          try {
            const r = await api("/admin/inventory/" + encodeURIComponent(id) + "/adjust", {
              method: "POST",
              body: { mode, quantity: q, reason: document.getElementById("adjReason").value },
            });
            toast("✅ " + r.previousQuantity + " ← " + r.newQuantity);
            pageInventoryDetails(id);
          } catch (ex) {
            err.textContent = ex.message || "تعذر التنفيذ.";
            err.classList.add("show");
            btn.disabled = false;
            btn.textContent = "💾 تنفيذ العملية";
          }
        });
      }
    } catch (ex) {
      view.innerHTML = '<a class="ad-back" data-link href="/admin/inventory">→ رجوع للمخزون</a>' +
        stateHTML("⚠️", "تعذر تحميل المنتج", ex.message || "");
    }
  }

  /* ================= الأقسام ================= */

  async function pageCategories() {
    setChrome("categories");
    document.title = "الأقسام | لوحة التحكم";
    view.innerHTML = '<div class="ad-page-head"><div><h1>🗂️ الأقسام</h1><p>أقسام المحل — تظهر للزبائن بنفس الترتيب.</p></div>' +
      '<button type="button" class="ad-btn ad-btn-primary ad-btn-sm" id="catNew">＋ قسم جديد</button></div>' +
      '<div class="ad-list" id="catList">' + skel(4) + "</div>";

    document.getElementById("catNew").addEventListener("click", async () => {
      const form = await formModal("＋ قسم جديد",
        '<div class="ad-field"><label>اسم القسم *</label><input id="mdName" placeholder="مثال: العطارة" /></div>' +
        '<div class="ad-field"><label>المعرف (إنجليزي — اختياري)</label><input id="mdSlug" placeholder="مثال: attara" dir="ltr" style="text-align:right" /></div>' +
        '<div class="ad-field"><label>الأيقونة</label><input id="mdIcon" placeholder="🗂️" /></div>',
        "إضافة القسم");
      if (!form) return;
      try {
        await api("/admin/categories", {
          method: "POST",
          body: { name: form.querySelector("#mdName").value.trim(), slug: form.querySelector("#mdSlug").value.trim(), image: form.querySelector("#mdIcon").value.trim() },
        });
        ADMIN_CATS = null;
        closeModal();
        toast("✅ تمت إضافة القسم");
        pageCategories();
      } catch (ex) { modalError(ex.message || "تعذر الإضافة."); }
    });

    try {
      const d = await api("/admin/categories");
      const cats = d.categories || [];
      document.getElementById("catList").innerHTML = cats.length
        ? cats.map((c, i) =>
          '<article class="ad-card ad-row-card">' +
          '<div class="ad-row-top"><strong><span class="ad-product-emoji" aria-hidden="true">' + esc(c.image || c.icon || "🗂️") + "</span> " + esc(c.name) + "</strong>" +
          "<span>" + (c.active ? '<span class="st st-completed">🟢 نشط</span>' : '<span class="st st-cancelled">🔴 معطّل</span>') + "</span></div>" +
          '<div class="ad-row-meta"><span>🧾 ' + (c.productsCount || 0) + ' منتج</span><span dir="ltr">' + esc(c.slug) + "</span></div>" +
          '<div class="ad-row-actions">' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-catedit="' + esc(c.id) + '">✏️ تعديل</button>' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-cattoggle="' + esc(c.id) + '" data-av="' + (c.active ? "1" : "0") + '">' + (c.active ? "⏸️ تعطيل" : "▶️ تفعيل") + "</button>" +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-catmove="' + esc(c.id) + '" data-dir="up"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-catmove="' + esc(c.id) + '" data-dir="down"' + (i === cats.length - 1 ? " disabled" : "") + '>↓</button>' +
          "</div></article>").join("")
        : stateHTML("🗂️", "لا توجد أقسام", "أضف أول قسم من الزر بالأعلى.");

      view.querySelectorAll("[data-catedit]").forEach((b) => b.addEventListener("click", async () => {
        const c = cats.find((x) => x.id === b.dataset.catedit);
        if (!c) return;
        const form = await formModal("✏️ تعديل: " + c.name,
          '<div class="ad-field"><label>اسم القسم *</label><input id="mdName" value="' + esc(c.name) + '" /></div>' +
          '<div class="ad-field"><label>الأيقونة</label><input id="mdIcon" value="' + esc(c.image || "") + '" /></div>',
          "حفظ");
        if (!form) return;
        try {
          await api("/admin/categories/" + encodeURIComponent(c.id), {
            method: "PATCH",
            body: { name: form.querySelector("#mdName").value.trim(), image: form.querySelector("#mdIcon").value.trim() },
          });
          ADMIN_CATS = null;
          closeModal();
          toast("✅ تم حفظ القسم");
          pageCategories();
        } catch (ex) { modalError(ex.message || "تعذر الحفظ."); }
      }));

      view.querySelectorAll("[data-cattoggle]").forEach((b) => b.addEventListener("click", async () => {
        const to = b.dataset.av !== "1";
        if (!to) {
          const ok = await confirmDlg("تعطيل القسم؟", "سيُخفى هذا القسم من واجهة الزبائن (المنتجات تظل موجودة).", "تعطيل", true);
          if (!ok) return;
        }
        try {
          await api("/admin/categories/" + encodeURIComponent(b.dataset.cattoggle), { method: "PATCH", body: { active: to } });
          ADMIN_CATS = null;
          toast(to ? "✅ تم تفعيل القسم" : "⏸️ تم تعطيل القسم");
          pageCategories();
        } catch (ex) { toast(ex.message || "تعذر الحفظ", true); }
      }));

      view.querySelectorAll("[data-catmove]").forEach((b) => b.addEventListener("click", async () => {
        try {
          await api("/admin/categories/" + encodeURIComponent(b.dataset.catmove), { method: "PATCH", body: { direction: b.dataset.dir } });
          ADMIN_CATS = null;
          pageCategories();
        } catch (ex) { toast(ex.message || "تعذر التحريك", true); }
      }));
    } catch (ex) {
      document.getElementById("catList").innerHTML = stateHTML("⚠️", "حدث خطأ أثناء تحميل الأقسام", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageCategories());
    }
  }

  async function pageCustomers() {
    setChrome("customers");
    document.title = "العملاء | لوحة التحكم";
    const qs = new URLSearchParams(location.search);
    const search = qs.get("search") || "";
    const sort = qs.get("sort") || "";
    const page = Math.max(1, Number(qs.get("page")) || 1);
    const go = (patch) => {
      const nq = new URLSearchParams(location.search);
      Object.entries(patch).forEach(([k, v]) => { if (!v) nq.delete(k); else nq.set(k, v); });
      navigate("/admin/customers" + (nq.toString() ? "?" + nq : ""));
    };

    view.innerHTML =
      '<div class="ad-page-head"><div><h1>👥 العملاء</h1><p>كل عملاء المحل ونشاطهم.</p></div></div>' +
      '<div class="ad-toolbar"><div class="ad-search"><span aria-hidden="true">🔎</span><input id="cSearch" placeholder="ابحث بالاسم أو الهاتف..." value="' + esc(search) + '" /></div>' +
      '<select id="cSort" class="ad-btn ad-btn-outline ad-btn-sm" style="min-height:50px" aria-label="ترتيب العملاء">' +
      [["", "الأحدث"], ["top_spent", "💰 الأكثر شراءً"], ["top_orders", "🧾 الأكثر طلبًا"]].map(([v, l]) => '<option value="' + v + '"' + (v === sort ? " selected" : "") + ">" + l + "</option>").join("") +
      "</select></div>" +
      '<div class="ad-list" id="cList">' + skel(4) + "</div><div id='cPager'></div>";

    let timer = null;
    document.getElementById("cSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => go({ search: e.target.value.trim(), page: "" }), 400);
    });
    document.getElementById("cSort").addEventListener("change", (e) => go({ sort: e.target.value, page: "" }));

    try {
      const q = new URLSearchParams({ limit: "20", page: String(page) });
      if (search) q.set("search", search);
      if (sort) q.set("sort", sort);
      const data = await api("/admin/customers?" + q);
      document.getElementById("cList").innerHTML = data.customers.length
        ? data.customers.map((c) =>
          '<a class="ad-card ad-row-card" data-link href="/admin/customers/' + esc(c.id) + '">' +
          '<div class="ad-row-top"><strong>👤 ' + esc(c.name) + "</strong><span>🧾 " + c.ordersCount + " طلب" +
          (c.status === "blocked" ? ' <span class="st st-ontg-failed">⛔ موقوف</span>' : c.status === "inactive" ? ' <span class="st st-cancelled">⚪ غير نشط</span>' : "") + "</span></div>" +
          '<div class="ad-row-meta"><span>📞 <b dir="ltr">' + esc(c.phone) + "</b></span><span>💰 إجمالي: <b>" + fmtPrice(c.totalSpent) + "</b></span>" +
          "<span>🕐 آخر طلب: " + (c.lastOrderAt ? esc(fmtDT(c.lastOrderAt)) : "—") + "</span></div>" +
          "</a>").join("")
        : stateHTML("👥", "لا يوجد عملاء", search ? "جرّب بحثًا مختلفًا." : "العملاء هيظهروا هنا بعد أول طلب.");
      const base = "/admin/customers?" + (() => { const b = new URLSearchParams(); if (search) b.set("search", search); if (sort) b.set("sort", sort); b.set("limit", "20"); return b.toString(); })();
      document.getElementById("cPager").innerHTML = pagerHTML(data.page, data.total, data.limit, base);
    } catch (ex) {
      document.getElementById("cList").innerHTML = stateHTML("⚠️", "حدث خطأ أثناء تحميل العملاء", ex.message || "", '<button type="button" class="ad-btn ad-btn-primary" id="retryBtn">إعادة المحاولة</button>');
      document.getElementById("retryBtn").addEventListener("click", () => pageCustomers());
    }
  }

  async function pageCustomerDetails(id) {
    setChrome("customers");
    document.title = "بيانات العميل | لوحة التحكم";
    view.innerHTML = '<a class="ad-back" data-link href="/admin/customers">→ رجوع للعملاء</a>' + skel(3);
    try {
      const c = await api("/admin/customers/" + encodeURIComponent(id));
      view.innerHTML =
        '<a class="ad-back" data-link href="/admin/customers">→ رجوع للعملاء</a>' +
        '<div class="ad-page-head"><div><h1>👤 ' + esc(c.name) + '</h1><p dir="ltr">📞 ' + esc(c.phone) + "</p></div></div>" +
        '<div class="ad-detail-grid cols-2">' +
        '<section class="ad-card"><h2>📋 البيانات</h2>' +
        '<div class="ad-kv"><span class="k">العنوان</span><span class="v">' + esc(c.address || "—") + "</span></div>" +
        '<div class="ad-kv"><span class="k">المنطقة</span><span class="v">' + esc(c.area || "—") + "</span></div>" +
        '<div class="ad-kv"><span class="k">علامة مميزة</span><span class="v">' + esc(c.landmark || "—") + "</span></div>" +
        '<div class="ad-kv"><span class="k">عميل منذ</span><span class="v">' + esc(fmtDT(c.createdAt)) + "</span></div>" +
        "</section>" +
        '<section class="ad-card"><h2>📊 النشاط</h2>' +
        '<div class="ad-kv"><span class="k">عدد الطلبات</span><span class="v">' + c.ordersCount + "</span></div>" +
        '<div class="ad-kv"><span class="k">إجمالي المشتريات</span><span class="v">' + fmtPrice(c.totalSpent) + "</span></div>" +
        "</section>" +
        '<section class="ad-card"><h2>⚙️ الحالة والملاحظات</h2>' +
        '<div class="ad-field"><label for="csStatus">الحالة</label><select id="csStatus">' +
        [["active", "🟢 نشط"], ["inactive", "⚪ غير نشط"], ["blocked", "⛔ موقوف"]].map(([v, l]) => '<option value="' + v + '"' + (c.status === v ? " selected" : "") + ">" + l + "</option>").join("") +
        "</select></div>" +
        '<div class="ad-field" style="margin-top:.5rem"><label for="csNotes">ملاحظات داخلية (لا تظهر للعميل)</label><textarea id="csNotes" placeholder="...">' + esc(c.notes || "") + "</textarea></div>" +
        '<button type="button" class="ad-btn ad-btn-primary ad-btn-sm" id="csSave" style="margin-top:.5rem">💾 حفظ</button>' +
        "</section>" +
        '<section class="ad-card"><h2>🏆 أكثر المنتجات شراءً</h2>' +
        ((c.topProducts && c.topProducts.length)
          ? c.topProducts.slice(0, 8).map((t, i) => '<div class="ad-kv"><span class="k">' + (i + 1) + ". " + esc(t.name) + "</span><span class='v'>" + t.times + " مرات</span></div>").join("")
          : '<p style="color:var(--muted);font-size:.88rem">لا توجد مشتريات بعد.</p>') +
        "</section>" +
        '<section class="ad-card"><h2>❤️ الأقسام المفضلة</h2>' +
        ((c.favoriteCategories && c.favoriteCategories.length)
          ? '<div class="ad-chips">' + c.favoriteCategories.map((f) => '<button type="button" disabled>' + esc(catName(f.category)) + "</button>").join("") + "</div>"
          : '<p style="color:var(--muted);font-size:.88rem">لا توجد بيانات بعد.</p>') +
        "</section></div>" +
        '<h2 class="ad-section-title">🧾 سجل الطلبات</h2>' +
        '<div class="ad-list">' +
        (c.orders.length
          ? c.orders.map((o) =>
            '<a class="ad-card ad-row-card" data-link href="/admin/orders/' + esc(o.orderNumber) + '">' +
            '<div class="ad-row-top"><strong>' + esc(o.orderNumber) + "</strong>" + stBadge(o.status) + "</div>" +
            '<div class="ad-row-meta"><span>📦 ' + o.itemsCount + " قطعة</span><span>💰 <b>" + fmtPrice(o.total) + "</b></span><span>🕐 " + esc(fmtDT(o.createdAt)) + "</span></div>" +
            "</a>").join("")
          : stateHTML("🧾", "لا توجد طلبات", "لم يقم هذا العميل بأي طلب بعد.")) +
        "</div>";

      document.getElementById("csSave").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const st = document.getElementById("csStatus").value;
        if (st === "blocked" && c.status !== "blocked") {
          const ok = await confirmDlg("حظر العميل؟", "لن يتمكن " + c.name + " من إنشاء طلبات جديدة. الطلبات القديمة محفوظة.", "حظر", true);
          if (!ok) return;
        }
        btn.disabled = true;
        try {
          await api("/admin/customers/" + encodeURIComponent(id), { method: "PATCH", body: { status: st, notes: document.getElementById("csNotes").value } });
          toast("✅ تم حفظ بيانات العميل");
          pageCustomerDetails(id);
        } catch (ex) { toast(ex.message || "تعذر الحفظ", true); btn.disabled = false; }
      });
    } catch (ex) {
      view.innerHTML = '<a class="ad-back" data-link href="/admin/customers">→ رجوع للعملاء</a>' +
        stateHTML("⚠️", "تعذر تحميل العميل", ex.message || "");
    }
  }

  /* ================= التوجيه ================= */

  function render() {
    const path = location.pathname.replace(/\/+$/, "") || "/admin";
    if (path === "/admin/login") return void pageLogin();
    if (!getToken()) { location.href = "/admin/login"; return; }

    let m;
    if (path === "/admin") return void pageDashboard();
    if (path === "/admin/orders") return void pageOrders();
    if ((m = path.match(/^\/admin\/orders\/(.+)$/))) return void pageOrderDetails(decodeURIComponent(m[1]));
    if (path === "/admin/products") return void pageProducts();
    if (path === "/admin/products/new") return void pageProductForm(null);
    if ((m = path.match(/^\/admin\/products\/(.+)\/edit$/))) return void pageProductForm(decodeURIComponent(m[1]));
    if (path === "/admin/inventory") return void pageInventory();
    if ((m = path.match(/^\/admin\/inventory\/(.+)$/))) return void pageInventoryDetails(decodeURIComponent(m[1]));
    if (path === "/admin/categories") return void pageCategories();
    if (path === "/admin/customers") return void pageCustomers();
    if ((m = path.match(/^\/admin\/customers\/(.+)$/))) return void pageCustomerDetails(decodeURIComponent(m[1]));
    setChrome("dashboard");
    view.innerHTML = stateHTML("🔍", "الصفحة غير موجودة", "تأكد من الرابط وحاول مجددًا.", '<a class="ad-btn ad-btn-primary" data-link href="/admin/">الرئيسية</a>');
  }

  document.getElementById("adLogout").addEventListener("click", async () => {
    try { await api("/admin/logout", { method: "POST" }); } catch {}
    clearToken();
    location.href = "/admin/login";
  });

  render();
})();
