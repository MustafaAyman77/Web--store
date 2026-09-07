/* ==========================================================================
   أسواق البسيط — Offers (صفحة العروض offers.html فقط)
   كل عرض حقيقي + منتجاته (بأسعار الباك النهائية) في قسم مستقل.
   بدون Backend: رسالة لطيفة + رابط للمنتجات (لا عروض وهمية).
   ========================================================================== */
(function (global) {
  "use strict";

  function isOffersPage() {
    return !!document.getElementById("offersList");
  }

  function sectionHTML(promo, products) {
    const UI = global.Basit.UI;
    const P = global.Basit.Promos;
    const cards = products.length
      ? products.map(UI.productCardHTML).join("")
      : '<p class="demo-note" role="note">منتجات هذا العرض غير متاحة حاليًا.</p>';
    return (
      '<section class="offer-section" aria-label="' + UI.esc(promo.name) + '">' +
        '<div class="offer-sec-head">' +
          '<div><h2>🎉 ' + UI.esc(promo.name) + '</h2>' +
          (promo.description ? "<p>" + UI.esc(promo.description) + "</p>" : "") + "</div>" +
          '<div class="offer-sec-side">' +
            '<span class="offer-off offer-off-static">🔥 ' + UI.esc(P.valueText(promo)) + "</span>" +
            (promo.endAt ? '<span class="promo-count promo-count-lg" data-countdown="' + UI.esc(promo.endAt) + '"></span>' : "") +
          "</div>" +
        "</div>" +
        '<div class="product-grid">' + cards + "</div>" +
      "</section>"
    );
  }

  async function render() {
    const box = document.getElementById("offersList");
    if (!box) return;
    const UI = global.Basit.UI;
    box.innerHTML = '<p class="demo-note" role="status">⏳ جاري تحميل العروض...</p>';
    let promos = null;
    try {
      promos = await global.Basit.Promos.ensure();
    } catch (e) { promos = null; }
    if (!promos || !promos.length) {
      box.innerHTML =
        '<div class="shop-empty" role="status">' +
          '<span class="shop-empty-icon" aria-hidden="true">🔥</span>' +
          "<h3>لا توجد عروض نشطة حاليًا.</h3>" +
          "<p>تابعنا — العروض الجديدة بتتضاف أول بأول.</p>" +
          '<a class="btn btn-primary" href="products.html">تصفح المنتجات ←</a>' +
        "</div>";
      return;
    }
    const groups = global.Basit.Promos.groupProducts(global.BasitData.products);
    box.innerHTML = promos.map((pr) => sectionHTML(pr, groups[pr.id] || [])).join("");
    global.Basit.Promos.tick();
  }

  function init() {
    if (!isOffersPage()) return;
    // البيانات تُستبدل في الإقلاع قبل init — ننتظر دورة واحدة للأمان
    setTimeout(render, 50);
  }

  global.Basit = global.Basit || {};
  global.Basit.Offers = { init };
})(window);
