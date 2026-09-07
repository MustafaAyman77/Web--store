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

  const CATS = [
    ["beverages", "🥤 المشروبات"], ["snacks", "🍫 السناكس والحلويات"],
    ["dairy", "🥛 الألبان"], ["grocery", "🛒 البقالة"],
    ["cleaning", "🧹 المنظفات"], ["care", "🧴 العناية الشخصية"],
    ["frozen", "🧊 المجمدات"], ["home", "🏠 مستلزمات المنزل"],
    ["offers", "🎁 عروض مجمعة"],
  ];
  const catName = (id) => (CATS.find((c) => c[0] === id) || ["", id])[1];
  const fulfillName = (m) => (m === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل");

  function stockBadge(p) {
    if (p.stockQuantity === null || p.stockQuantity === undefined) return '<span class="ad-stock">بدون تتبع</span>';
    const s = Number(p.stockQuantity);
    if (s <= 0) return '<span class="ad-stock out">نفدت الكمية (0)</span>';
    if (s <= 5) return '<span class="ad-stock low">⚠️ المخزون: ' + s + "</span>";
    return '<span class="ad-stock ok">المخزون: ' + s + "</span>";
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
      const lowAlert = d.lowStock && d.lowStock.length
        ? '<div class="ad-alert"><span>⚠️</span><span>مخزون منخفض: ' +
          d.lowStock.slice(0, 4).map((p) => esc(p.name) + " (" + p.stock + ")").join("، ") +
          "</span></div>"
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
          ? await confirmDlg("إلغاء الطلب؟", "هل أنت متأكد من إلغاء الطلب " + o.orderNumber + "؟", "نعم، إلغاء", true)
          : await confirmDlg("تغيير الحالة؟", "نقل الطلب " + o.orderNumber + " إلى: " + label, "حفظ");
        if (!ok) return;
        saveBtn.disabled = true;
        try {
          await api("/admin/orders/" + encodeURIComponent(o.orderNumber) + "/status", { method: "PATCH", body: { status: to } });
          toast("✅ تم تحديث الحالة إلى: " + label);
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
    const page = Math.max(1, Number(qs.get("page")) || 1);

    view.innerHTML =
      '<div class="ad-page-head"><div><h1>📦 المنتجات</h1><p>الأسعار والمخزون والتوفر من مكان واحد.</p></div>' +
      '<a class="ad-btn ad-btn-primary ad-btn-sm" data-link href="/admin/products/new">＋ منتج جديد</a></div>' +
      '<div class="ad-toolbar"><div class="ad-search"><span aria-hidden="true">🔎</span><input id="pSearch" placeholder="ابحث باسم المنتج..." value="' + esc(search) + '" /></div>' +
      '<select id="pCat" class="ad-btn ad-btn-outline ad-btn-sm" style="min-height:50px" aria-label="فلترة حسب القسم">' +
      '<option value="">كل الأقسام</option>' + CATS.map(([v, l]) => '<option value="' + v + '"' + (v === category ? " selected" : "") + ">" + esc(l) + "</option>").join("") +
      "</select></div>" +
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

    try {
      const q = new URLSearchParams({ limit: "20", page: String(page) });
      if (search) q.set("search", search);
      if (category) q.set("category", category);
      const data = await api("/admin/products?" + q);
      document.getElementById("pList").innerHTML = data.products.length
        ? data.products.map((p) =>
          '<article class="ad-card ad-row-card" style="opacity:' + (p.available ? "1" : "0.65") + '">' +
          '<div class="ad-row-top"><strong><span class="ad-product-emoji" aria-hidden="true">' + esc(p.image || "📦") + "</span> " + esc(p.name) + "</strong>" +
          "<span>" + (p.available ? '<span class="st st-completed">متاح ✅</span>' : '<span class="st st-cancelled">موقوف ⛔</span>') +
          (p.offer ? ' <span class="st st-preparing">🔥 عرض</span>' : "") + "</span></div>" +
          '<div class="ad-row-meta"><span>' + esc(catName(p.category)) + "</span><span>💰 <b>" + fmtPrice(p.price) + "</b></span>" +
          (p.oldPrice ? "<span>بدلًا من <s>" + fmtPrice(p.oldPrice) + "</s></span>" : "") +
          "<span>" + stockBadge(p) + "</span></div>" +
          '<div class="ad-row-actions">' +
          '<a class="ad-btn ad-btn-outline ad-btn-sm" data-link href="/admin/products/' + esc(p.id) + '/edit">✏️ تعديل</a>' +
          '<button type="button" class="ad-btn ad-btn-outline ad-btn-sm" data-toggle="' + esc(p.id) + '" data-av="' + (p.available ? "1" : "0") + '">' + (p.available ? "⏸️ إيقاف" : "▶️ تفعيل") + "</button>" +
          '<button type="button" class="ad-btn ad-btn-ghost ad-btn-sm" data-del="' + esc(p.id) + '" data-name="' + esc(p.name) + '">🗑️ حذف</button>' +
          "</div></article>").join("")
        : stateHTML("📦", "لا توجد منتجات", search || category ? "جرّب بحثًا أو قسمًا مختلفًا." : "أضف أول منتج من زر «منتج جديد».");
      const base = "/admin/products?" + (() => { const b = new URLSearchParams(); if (search) b.set("search", search); if (category) b.set("category", category); b.set("limit", "20"); return b.toString(); })();
      document.getElementById("pPager").innerHTML = pagerHTML(data.page, data.total, data.limit, base);

      view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
        const to = b.dataset.av === "1" ? false : true;
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
      if (!isNew) {
        const d = await api("/products/" + encodeURIComponent(id));
        p = d;
      }
    } catch (ex) {
      view.innerHTML = '<a class="ad-back" data-link href="/admin/products">→ رجوع للمنتجات</a>' +
        stateHTML("⚠️", "تعذر تحميل المنتج", ex.message || "");
      return;
    }

    const v = (k, d) => (p && p[k] !== null && p[k] !== undefined ? p[k] : (d === undefined ? "" : d));
    view.innerHTML =
      '<a class="ad-back" data-link href="/admin/products">→ رجوع للمنتجات</a>' +
      '<div class="ad-page-head"><div><h1>' + (isNew ? "＋ منتج جديد" : "✏️ تعديل: " + esc(p.name)) + "</h1></div></div>" +
      '<form class="ad-card ad-form" id="pForm" novalidate>' +
      '<div class="ad-form-error" id="pErr" role="alert"></div>' +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fName">اسم المنتج <i>*</i></label><input id="fName" value="' + esc(v("name")) + '" placeholder="مثال: بيبسي 330 مل" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fCat">القسم <i>*</i></label><select id="fCat">' + CATS.map(([cv, l]) => '<option value="' + cv + '"' + (v("category") === cv ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select><span class='err'></span></div>" +
      "</div>" +
      '<div class="ad-field"><label for="fDesc">الوصف</label><textarea id="fDesc" placeholder="وصف قصير للمنتج...">' + esc(v("description", v("desc", ""))) + "</textarea></div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fPrice">السعر (جنيه) <i>*</i></label><input id="fPrice" type="number" min="0" step="0.5" value="' + esc(v("price")) + '" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fOld">السعر القديم (للعرض)</label><input id="fOld" type="number" min="0" step="0.5" value="' + esc(v("oldPrice", "")) + '" placeholder="اتركه فارغًا بدون عرض" /></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fUnit">الوحدة</label><input id="fUnit" value="' + esc(v("unit")) + '" placeholder="كانز / علبة / كيس..." /></div>' +
      '<div class="ad-field"><label for="fIcon">الأيقونة (إيموجي)</label><input id="fIcon" value="' + esc(v("image", v("icon", ""))) + '" placeholder="🥤" maxlength="10" /></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fStock">المخزون (فارغ = بدون تتبع)</label><input id="fStock" type="number" min="0" step="1" value="' + esc(v("stockQuantity", "")) + '" /><span class="err"></span></div>' +
      '<div class="ad-field"><label for="fPop">الشعبية (0-100)</label><input id="fPop" type="number" min="0" max="100" step="1" value="' + esc(v("popularity", 50)) + '" /></div>' +
      "</div>" +
      '<div class="ad-form-2">' +
      '<div class="ad-field"><label for="fBadgeT">نص الشارة</label><input id="fBadgeT" value="' + esc(p && p.badge ? p.badge.text : "") + '" placeholder="خصم / جديد..." /></div>' +
      '<div class="ad-field"><label for="fBadgeTone">نوع الشارة</label><select id="fBadgeTone">' +
      [["", "بدون"], ["offer", "🔥 عرض"], ["hot", "⭐ الأكثر طلبًا"], ["new", "✨ جديد"]].map(([bv, l]) => '<option value="' + bv + '"' + ((p && p.badge && p.badge.tone) === bv ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>" +
      "</div>" +
      '<div class="ad-checks">' +
      '<label><input type="checkbox" id="fAvail" ' + (isNew || v("available", true) ? "checked" : "") + ' /> ✅ متاح للبيع</label>' +
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
      const g = (id) => document.getElementById(id).value.trim();
      const price = Number(g("fPrice"));
      const oldRaw = g("fOld");
      const stockRaw = g("fStock");

      let bad = false;
      if (g("fName").length < 2) { fail(document.getElementById("fName"), "اسم المنتج مطلوب."); bad = true; }
      if (!Number.isFinite(price) || price <= 0) { fail(document.getElementById("fPrice"), "السعر يجب أن يكون أكبر من صفر."); bad = true; }
      if (stockRaw !== "" && (!Number.isInteger(Number(stockRaw)) || Number(stockRaw) < 0)) { fail(document.getElementById("fStock"), "المخزون رقم صحيح ≥ صفر."); bad = true; }
      if (bad) return;

      const body = {
        name: g("fName"), category: document.getElementById("fCat").value,
        description: g("fDesc"), price,
        oldPrice: oldRaw === "" ? null : Number(oldRaw),
        unit: g("fUnit"), image: g("fIcon") || "🛒",
        stockQuantity: stockRaw === "" ? null : Number(stockRaw),
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
  }

  async function pageCustomers() {
    setChrome("customers");
    document.title = "العملاء | لوحة التحكم";
    const qs = new URLSearchParams(location.search);
    const search = qs.get("search") || "";
    const page = Math.max(1, Number(qs.get("page")) || 1);

    view.innerHTML =
      '<div class="ad-page-head"><div><h1>👥 العملاء</h1><p>كل عملاء المحل ونشاطهم.</p></div></div>' +
      '<div class="ad-toolbar"><div class="ad-search"><span aria-hidden="true">🔎</span><input id="cSearch" placeholder="ابحث بالاسم أو الهاتف..." value="' + esc(search) + '" /></div></div>' +
      '<div class="ad-list" id="cList">' + skel(4) + "</div><div id='cPager'></div>";

    let timer = null;
    document.getElementById("cSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const nq = new URLSearchParams();
        if (e.target.value.trim()) nq.set("search", e.target.value.trim());
        navigate("/admin/customers" + (nq.toString() ? "?" + nq : ""));
      }, 400);
    });

    try {
      const q = new URLSearchParams({ limit: "20", page: String(page) });
      if (search) q.set("search", search);
      const data = await api("/admin/customers?" + q);
      document.getElementById("cList").innerHTML = data.customers.length
        ? data.customers.map((c) =>
          '<a class="ad-card ad-row-card" data-link href="/admin/customers/' + esc(c.id) + '">' +
          '<div class="ad-row-top"><strong>👤 ' + esc(c.name) + "</strong><span>🧾 " + c.ordersCount + " طلب</span></div>" +
          '<div class="ad-row-meta"><span>📞 <b dir="ltr">' + esc(c.phone) + "</b></span><span>💰 إجمالي: <b>" + fmtPrice(c.totalSpent) + "</b></span>" +
          "<span>🕐 آخر طلب: " + (c.lastOrderAt ? esc(fmtDT(c.lastOrderAt)) : "—") + "</span></div>" +
          "</a>").join("")
        : stateHTML("👥", "لا يوجد عملاء", search ? "جرّب بحثًا مختلفًا." : "العملاء هيظهروا هنا بعد أول طلب.");
      const base = "/admin/customers?" + (() => { const b = new URLSearchParams(); if (search) b.set("search", search); b.set("limit", "20"); return b.toString(); })();
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
