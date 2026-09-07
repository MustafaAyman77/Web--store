/* ==========================================================================
   أسواق البسيط — Track (صفحة تتبع الطلب track-order.html فقط)
   للضيوف: رقم طلب + هاتف مطابق. تحديث تلقائي يتوقف عند التسليم/الإلغاء.
   ========================================================================== */
(function (global) {
  "use strict";

  const STATUS = {
    new: "🆕 تم استلام الطلب",
    confirmed: "✅ تم تأكيد الطلب",
    preparing: "👨‍🍳 جاري تجهيز الطلب",
    ready: "📦 الطلب جاهز",
    out_for_delivery: "🚚 الطلب في الطريق",
    completed: "🎉 تم التسليم",
    cancelled: "❌ تم إلغاء الطلب",
  };
  const SHORT = {
    new: "تم استلام الطلب",
    confirmed: "تم تأكيد الطلب",
    preparing: "جاري تجهيز الطلب",
    ready: "الطلب جاهز",
    out_for_delivery: "في الطريق",
    completed: "تم التسليم",
  };
  const STEPS = ["new", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];
  let pollTimer = null;
  let pollSeconds = 30;
  let current = null; // { orderNumber, phone }

  const $ = (id) => document.getElementById(id);

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }
  function esc(s) { return global.Basit.UI.esc(s); }
  function fmtPrice(v) { return global.Basit.UI.fmtPrice(v); }

  function fmtTime(ts) {
    try {
      return new Date(String(ts).replace(" ", "T") + "Z").toLocaleString("ar-EG", {
        hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      });
    } catch (e) { return ""; }
  }

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

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function timeline(order) {
    if (order.status === "cancelled") {
      return '<div class="acc-cancelled">❌ تم إلغاء هذا الطلب — لو محتاج المنتجات اطلبها من جديد من <a href="products.html">المنتجات</a>.</div>';
    }
    const steps = order.fulfillmentMethod === "pickup"
      ? ["new", "confirmed", "preparing", "ready", "completed"]
      : STEPS;
    const idx = steps.indexOf(order.status);
    return '<ol class="acc-timeline">' + steps.map((s, i) => {
      const cls = i < idx ? "is-done" : i === idx ? "is-now" : "";
      const mark = i < idx ? "✓" : i === idx ? "●" : "○";
      return '<li class="' + cls + '"><span aria-hidden="true">' + mark + "</span> " + esc(SHORT[s]) + "</li>";
    }).join("") + "</ol>";
  }

  function historyList(hist) {
    if (!hist || !hist.length) return "";
    return '<div class="track-history"><h3>🕘 تطور الطلب</h3><ul>' +
      hist.map((h) =>
        "<li><b>" + esc(SHORT[h.status] || h.status) + "</b><span>" + esc(fmtTime(h.createdAt)) + "</span></li>"
      ).join("") + "</ul></div>";
  }

  function banner(order) {
    if (order.status === "completed") return '<div class="track-banner is-done">🎉 تم تسليم طلبك — شكرًا لاختيارك أسواق البسيط ❤️</div>';
    if (order.status === "cancelled") return '<div class="track-banner is-cancelled">❌ تم إلغاء الطلب</div>';
    if (order.status === "out_for_delivery") return '<div class="track-banner">🚗 طلبك في الطريق إليك</div>';
    if (order.status === "ready") {
      return order.fulfillmentMethod === "pickup"
        ? '<div class="track-banner">👍 طلبك جاهز للاستلام من المحل</div>'
        : '<div class="track-banner">👍 طلبك جاهز وهيخرج للتوصيل</div>';
    }
    if (order.status === "preparing") return '<div class="track-banner">🟢 جاري تجهيز طلبك الآن</div>';
    if (order.status === "confirmed") return '<div class="track-banner">✅ تم تأكيد طلبك وبدأنا التجهيز</div>';
    return '<div class="track-banner">🆕 تم استلام طلبك — هنراجعه ونأكده</div>';
  }

  async function fetchOrder() {
    const res = await fetch(base() + "/api/orders/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(current),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error((data.error && data.error.message) || "تعذر تحميل الطلب.");
    }
    return data.data;
  }

  function paint(order) {
    const box = $("trackResult");
    box.hidden = false;
    box.innerHTML =
      banner(order) +
      "<h2>طلب #" + esc(order.orderNumber) + "</h2>" +
      '<p><span class="acc-status st-' + esc(order.status) + '">' + esc(STATUS[order.status] || "") + "</span></p>" +
      '<p class="acc-muted">🕘 آخر تحديث: ' + esc(ago(order.updatedAt || order.createdAt)) + " • " +
      (order.fulfillmentMethod === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل") + "</p>" +
      timeline(order) +
      historyList(order.statusHistory) +
      '<div class="acc-items">' +
      order.items.map((it) =>
        '<div class="summary-line"><span>' + esc(it.name) + " × " + it.quantity + "</span><b>" + fmtPrice(it.subtotal) + "</b></div>"
      ).join("") +
      '<div class="summary-total"><span>الإجمالي</span><output>' + fmtPrice(order.total) + "</output></div>" +
      "</div>" +
      '<p class="track-live" id="trackLive">🔄 تحديث تلقائي كل ' + pollSeconds + " ثانية</p>" +
      '<button type="button" class="btn btn-outline btn-block" id="trackOther">🔍 تتبع طلب آخر</button>';
    document.getElementById("trackOther").addEventListener("click", () => {
      stopPolling();
      current = null;
      box.hidden = true;
      box.innerHTML = "";
      $("trackFormCard").hidden = false;
      $("trackNumber").value = "";
      $("trackNumber").focus();
    });
    // إيقاف التحديث عند الحالات النهائية
    if (order.status === "completed" || order.status === "cancelled") {
      stopPolling();
      const live = document.getElementById("trackLive");
      if (live) live.remove();
    }
  }

  async function refresh() {
    if (!current) return;
    try {
      paint(await fetchOrder());
    } catch (e) { /* يُبقي آخر حالة معروضة */ }
  }

  function alert(msg) {
    const box = $("trackAlert");
    if (!msg) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = msg;
  }

  function init() {
    if (!$("trackForm")) return;
    stopPolling();
    // فترة التحديث من إعدادات السيرفر
    fetch(base() + "/api/config").then((r) => r.json()).then((d) => {
      const s = Number(d && d.data && d.data.statusPollSeconds);
      if (Number.isFinite(s) && s >= 15) pollSeconds = s;
    }).catch(() => {});

    // تعبئة من الرابط (رقم الطلب فقط) + الهاتف المتذكَّر على الجهاز
    const qs = new URLSearchParams(location.search);
    if (qs.get("n")) $("trackNumber").value = qs.get("n");
    try {
      const r = global.Basit.Recs ? global.Basit.Recs.getRemembered() : null;
      if (r && !$("trackPhone").value) $("trackPhone").value = r.phone;
      const Auth = global.Basit.Auth;
      if (Auth) Auth.ensure().then((me) => {
        if (me && !$("trackPhone").value) $("trackPhone").value = me.phone;
      });
    } catch (e) { /* تجاهل */ }

    $("trackForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      alert("");
      const orderNumber = $("trackNumber").value.trim();
      const phone = $("trackPhone").value.trim();
      if (!orderNumber || !/^01[0-9]{9}$/.test(phone)) {
        alert("من فضلك أدخل رقم الطلب ورقم هاتف مصري صحيح.");
        return;
      }
      const btn = $("trackBtn");
      btn.disabled = true;
      try {
        current = { orderNumber, phone };
        paint(await fetchOrder());
        $("trackFormCard").hidden = true;
        $("trackResult").scrollIntoView({ behavior: "smooth", block: "start" });
        stopPolling();
        pollTimer = setInterval(refresh, pollSeconds * 1000);
      } catch (err) {
        current = null;
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  global.Basit = global.Basit || {};
  global.Basit.Track = { init };
  document.addEventListener("pagehide", stopPolling);
})(window);
