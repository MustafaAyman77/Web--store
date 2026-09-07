/* ==========================================================================
   أسواق البسيط — Success (صفحة نجاح الطلب success.html فقط)
   تعرض آخر طلب — برقم السيرفر (BS-...) عند توفره، أو الرقم التجريبي.
   ========================================================================== */
(function (global) {
  "use strict";

  function init() {
    const root = document.getElementById("successRoot");
    if (!root) return;
    const UI = global.Basit.UI;
    const Orders = global.Basit.Orders;
    const order = Orders.getLastOrder();

    if (!order || (!order.orderNumber && !order.orderId)) {
      root.innerHTML =
        '<div class="success-card">' +
          '<span class="success-emoji" aria-hidden="true">🧾</span>' +
          "<h2>لا يوجد طلب لعرضه</h2>" +
          '<p class="success-time">لم يتم تسجيل أي طلب بعد في هذه النسخة التجريبية.</p>' +
          '<div class="success-actions" style="margin-top:1.2rem">' +
            '<a class="btn btn-primary" href="products.html">🛒 العودة للتسوق</a>' +
            '<a class="btn btn-outline" href="index.html">🏠 الرئيسية</a>' +
          "</div>" +
        "</div>";
      return;
    }

    const orderNo = order.orderNumber || order.orderId;
    const method = order.fulfillmentMethod === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل";
    const count = (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const time = Orders.formatOrderTime(order.createdAt);
    const total = order.serverTotal != null ? order.serverTotal : order.total;
    const demoNote = order.mode === "backend"
      ? "✅ تم حفظ طلبك في نظام المحل.<br />سيتم مراجعة طلبك وتأكيده."
      : "✅ تم تسجيل طلبك في النسخة التجريبية.<br />سيتم مراجعة طلبك وتأكيده.";

    root.innerHTML =
      '<div class="success-card">' +
        '<span class="success-emoji" aria-hidden="true">🎉</span>' +
        "<h2>تم استلام طلبك بنجاح!</h2>" +
        '<p class="order-label">رقم طلبك</p>' +
        '<div><span class="order-no-big">#' + UI.esc(orderNo) + "</span></div>" +
        (time ? '<p class="success-time">' + UI.esc(time) + "</p>" : "") +
        '<div class="success-rows">' +
          '<div class="summary-line"><span>👤 الاسم</span><b>' + UI.esc(order.customer.name) + "</b></div>" +
          '<div class="summary-line"><span>📞 الهاتف</span><b>' + UI.esc(order.customer.phone) + "</b></div>" +
          '<div class="summary-line"><span>🚚 الاستلام</span><b>' + method + "</b></div>" +
          '<div class="summary-line"><span>🛍️ المنتجات</span><b>' + count + " قطعة</b></div>" +
          '<div class="summary-total"><span>الإجمالي</span><output>' + UI.fmtPrice(total) + "</output></div>" +
        "</div>" +
        '<p class="success-note">' + demoNote + "</p>" +
        '<div class="success-actions">' +
          '<a class="btn btn-primary" href="products.html">🛒 العودة للتسوق</a>' +
          '<a class="btn btn-outline" href="index.html">🏠 الرئيسية</a>' +
        "</div>" +
      "</div>";
  }

  global.Basit = global.Basit || {};
  global.Basit.Success = { init };
})(window);
