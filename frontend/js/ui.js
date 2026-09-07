/* ==========================================================================
   أسواق البسيط — UI
   كل ما يخص العرض والتفاعل: بناء الأقسام/المنتجات/العروض، تفاصيل المنتج،
   السلة، نافذة تأكيد الطلب، التنبيهات، والتنقل — مقسمة لدوال منظمة.
   ملف مشترك بين الصفحة الرئيسية (index.html) وصفحة المنتجات (products.html).
   ========================================================================== */
(function (global) {
  "use strict";

  const { Cart } = global.Basit;
  const Data = global.BasitData;
  const Config = global.BasitConfig;

  /* ================= أدوات مساعدة ================= */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtPrice(n) {
    return Number(n || 0).toLocaleString("en-US") + " " + Config.store.currency;
  }

  /* ================= التنبيهات (Toast) ================= */

  function toast(message, icon) {
    const wrap = $("#toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<span class="t-icon" aria-hidden="true">' + esc(icon || "✅") + "</span>" +
      "<span>" + esc(message) + "</span>";
    wrap.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2200);
    setTimeout(() => el.remove(), 2500);
  }

  /* ================= كارت المنتج الموحد ================= */

  const ADD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  function badgeClass(tone) {
    if (tone === "hot") return "product-tag is-hot";
    if (tone === "new") return "product-tag is-new";
    return "product-tag";
  }

  /**
   * HTML كارت المنتج — يُستخدم في الرئيسية وصفحة المنتجات والترشيحات.
   * الصورة والاسم يفتحان نافذة التفاصيل.
   */
  function productCardHTML(p) {
    if (!p || !p.id) return "";
    const cat = Data.getCategory(p.category);
    const available = p.available !== false;
    const outOfStock = p.outOfStock === true;
    const tag = outOfStock
      ? '<span class="product-tag is-off">🔴 نفد المخزون</span>'
      : !available
        ? '<span class="product-tag is-off">غير متوفر</span>'
        : (p.badge ? '<span class="' + badgeClass(p.badge.tone) + '">' + esc(p.badge.text) + "</span>"
          : (p.isNew ? '<span class="product-tag is-new">🆕 جديد</span>' : ""));
    const boughtLine = (available && global.Basit.Recs && global.Basit.Recs.isBought(p.id))
      ? '<p class="bought-before">❤️ اشتريته قبل كده</p>'
      : "";
    const old = p.oldPrice && p.oldPrice > p.price
      ? '<span class="price-old">' + fmtPrice(p.oldPrice) + "</span>"
      : "";
    const tint = p.tint || ["#f1f5f9", "#e2e8f0"];
    const action = available
      ? '<button type="button" class="add-btn" data-add-product="' + esc(p.id) + '" aria-label="أضف ' + esc(p.name) + ' للسلة">' +
        ADD_SVG + " أضف للسلة</button>"
      : '<button type="button" class="add-btn is-disabled" disabled>' + (outOfStock ? "🔴 نفد المخزون" : "غير متوفر حاليًا") + "</button>";

    return (
      '<article class="product-card' + (available ? "" : " is-unavailable") + '">' +
        '<button type="button" class="p-open product-visual" data-product="' + esc(p.id) + '" ' +
          'aria-label="عرض تفاصيل ' + esc(p.name) + '" ' +
          'style="--p1:' + esc(tint[0]) + ";--p2:" + esc(tint[1]) + '">' +
          tag +
          '<span class="p-icon" aria-hidden="true">' + esc(p.icon || "🛒") + "</span>" +
        "</button>" +
        '<div class="product-body">' +
          '<span class="product-cat">' + esc(cat ? cat.name : "") + "</span>" +
          '<button type="button" class="p-open product-name" data-product="' + esc(p.id) + '">' + esc(p.name) + "</button>" +
          '<p class="product-desc">' + esc(p.desc || "") + "</p>" +
          boughtLine +
          '<div class="product-foot">' +
            '<div class="price-row"><span class="price">' + fmtPrice(p.price) + "</span>" + old +
            (p.unit ? '<span class="price-unit">/ ' + esc(p.unit) + "</span>" : "") + "</div>" +
            action +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ================= أقسام الرئيسية ================= */

  let homeCategory = "all";

  function renderCategories() {
    const grid = $("#catGrid");
    if (!grid) return;
    grid.innerHTML = Data.categories.map((cat) => {
      const count = Data.countByCategory(cat.id);
      return (
        '<button type="button" class="cat-card reveal is-visible" data-category="' + esc(cat.id) + '">' +
          '<span class="cat-icon" aria-hidden="true">' + esc(cat.icon) + "</span>" +
          "<strong>" + esc(cat.name) + "</strong>" +
          "<small>" + count + " منتجات</small>" +
        "</button>"
      );
    }).join("");

    // الضغط على القسم → صفحة المنتجات مفلترة بهذا القسم
    grid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-category]");
      if (!card) return;
      window.location.href = "products.html?cat=" + encodeURIComponent(card.dataset.category);
    });
  }

  function renderHomeFilters() {
    const row = $("#filterRow");
    if (!row) return;
    const chips = [{ id: "all", name: "الكل", icon: "🛍️" }].concat(Data.categories);
    row.innerHTML = chips.map((c) =>
      '<button type="button" role="tab" class="chip' + (c.id === homeCategory ? " is-active" : "") +
      '" data-filter="' + esc(c.id) + '" aria-selected="' + (c.id === homeCategory) + '">' +
      "<span aria-hidden='true'>" + esc(c.icon) + "</span> " + esc(c.name) + "</button>"
    ).join("");

    row.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filter]");
      if (!chip) return;
      homeCategory = chip.dataset.filter;
      $$("#filterRow .chip").forEach((ch) => {
        const on = ch.dataset.filter === homeCategory;
        ch.classList.toggle("is-active", on);
        ch.setAttribute("aria-selected", on ? "true" : "false");
      });
      renderHomeProducts();
    });
  }

  function renderHomeProducts() {
    const grid = $("#productGrid");
    if (!grid) return;
    const list = Data.featuredByCategory(homeCategory);
    if (!list.length) {
      grid.innerHTML = '<p class="demo-note" role="note">لا توجد منتجات مميزة في هذا القسم حاليًا — ' +
        '<a href="products.html" style="font-weight:800;color:var(--brand-700)">تصفح كل المنتجات ←</a></p>';
      return;
    }
    grid.innerHTML = list.map(productCardHTML).join("");
  }

  /* ================= بناء العروض ================= */

  function renderOffers() {
    const grid = $("#offerGrid");
    if (!grid) return;
    grid.innerHTML = Data.offers.map((o) => {
      const off = Data.discountPercent(o.oldPrice, o.newPrice);
      const itemsHtml = o.items.map((it) => "<li>" + esc(it) + "</li>").join("");
      return (
        '<article class="offer-card">' +
          '<span class="offer-off">خصم ' + off + "%</span>" +
          '<div class="offer-top">' +
            '<span class="offer-emoji" aria-hidden="true">' + esc(o.icon) + "</span>" +
            "<div><h3>" + esc(o.name) + "</h3><small>" + esc(o.sub) + "</small></div>" +
          "</div>" +
          '<div class="offer-body">' +
            '<ul class="offer-items">' + itemsHtml + "</ul>" +
            '<div class="offer-prices"><span class="offer-new">' + fmtPrice(o.newPrice) + "</span>" +
            '<span class="offer-old">' + fmtPrice(o.oldPrice) + "</span></div>" +
            '<button type="button" class="btn btn-accent btn-block" data-add-offer="' + esc(o.id) + '" aria-label="أضف ' + esc(o.name) + ' للسلة">' +
              "🛒 أضف العرض للسلة" +
            "</button>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  /* ================= نافذة تفاصيل المنتج ================= */

  let modalQty = 1;

  function openProduct(id) {
    const p = Data.getProduct(id);
    if (!p) { toast("المنتج غير موجود", "⚠️"); return; }
    modalQty = 1;
    renderProductModal(p);
    const modal = $("#productModal");
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
    document.body.style.overflow = "hidden";
  }

  function closeProduct() {
    const modal = $("#productModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => { modal.hidden = true; }, 300);
  }

  function renderProductModal(p) {
    const body = $("#productBody");
    if (!body) return;
    const cat = Data.getCategory(p.category);
    const available = p.available !== false;
    const tint = p.tint || ["#f1f5f9", "#e2e8f0"];
    const old = p.oldPrice && p.oldPrice > p.price
      ? '<span class="price-old">بدلًا من ' + fmtPrice(p.oldPrice) + "</span>"
      : "";
    const off = p.oldPrice && p.oldPrice > p.price
      ? '<span class="offer-off" style="position:static">خصم ' + Data.discountPercent(p.oldPrice, p.price) + "%</span>"
      : "";
    const related = Data.relatedProducts(p.id, 4);
    const times = global.Basit.Recs ? global.Basit.Recs.timesBought(p.id) : 0;
    const freqLine = !available || times <= 0 ? ""
      : times >= 3
        ? '<p class="bought-before">🔄 بتشتريه كتير — ' + times + " مرات قبل كده</p>"
        : '<p class="bought-before">❤️ اشتريته قبل كده</p>';

    body.innerHTML =
      '<div class="pd-grid">' +
        '<div class="pd-visual" style="--p1:' + esc(tint[0]) + ";--p2:" + esc(tint[1]) + '">' +
          (p.badge && available ? '<span class="' + badgeClass(p.badge.tone) + '">' + esc(p.badge.text) + "</span>" : "") +
          '<span class="pd-icon" aria-hidden="true">' + esc(p.icon || "🛒") + "</span>" +
        "</div>" +
        '<div class="pd-info">' +
          '<span class="product-cat">' + esc(cat ? cat.icon + " " + cat.name : "") + "</span>" +
          "<h4>" + esc(p.name) + "</h4>" +
          '<p class="pd-desc">' + esc(p.desc || "") + "</p>" +
          '<div class="pd-prices"><span class="price price-lg">' + fmtPrice(p.price) + "</span>" + old + off + "</div>" +
          '<p class="pd-stock ' + (available ? "in" : "out") + '">' +
            '<span aria-hidden="true">' + (p.outOfStock === true ? "🔴" : available ? "✅" : "⛔") + "</span> " +
            (p.outOfStock === true ? "نفد المخزون" : available ? ("متوفر" + (p.lowStockQty > 0 ? " — ⚠️ باقي " + p.lowStockQty + " فقط" : "")) : "غير متوفر") +
          "</p>" +
          freqLine +
          (available
            ? '<div class="pd-buy">' +
                '<div class="stepper stepper-lg">' +
                  '<button type="button" id="pdDec" aria-label="إنقاص الكمية">−</button>' +
                  "<b id='pdQty'>1</b>" +
                  '<button type="button" id="pdInc" aria-label="زيادة الكمية">+</button>' +
                "</div>" +
                '<button type="button" class="btn btn-primary btn-lg pd-add" id="pdAdd">' + ADD_SVG + " أضف للسلة</button>" +
              "</div>"
            : '<button type="button" class="btn btn-block is-disabled" disabled>' + (p.outOfStock === true ? "🔴 نفد المخزون" : "غير متوفر حاليًا") + "</button>") +
        "</div>" +
      "</div>" +
      '<div class="pd-related"><h5>💡 ممكن يعجبك كمان</h5>' +
        '<div class="related-grid" id="pdRelated">' + related.map(productCardHTML).join("") + "</div></div>";

    body.scrollTop = 0;

    // ترقية الترشيحات من الـBackend — بصمت عند التعذر
    try {
      if (global.Basit.Recs) {
        global.Basit.Recs.forProduct(p.id, p.category).then((list) => {
          const box = $("#pdRelated");
          if (box && list && list.length) box.innerHTML = list.map(recCardHTML).join("");
        }).catch(() => {});
      }
    } catch (e) { /* تجاهل */ }

    if (!available) return;
    const max = Config.cart.maxQtyPerItem;
    const qtyEl = $("#pdQty");
    $("#pdDec").addEventListener("click", () => {
      modalQty = Math.max(1, modalQty - 1);
      qtyEl.textContent = modalQty;
    });
    $("#pdInc").addEventListener("click", () => {
      modalQty = Math.min(max, modalQty + 1);
      qtyEl.textContent = modalQty;
    });
    $("#pdAdd").addEventListener("click", () => {
      const result = Cart.add("product", p.id, modalQty);
      if (result === "added") {
        updateBadges();
        bumpCartBtn();
        closeProduct();
        toast("تمت إضافة المنتج للسلة ✓", "🛒");
      } else {
        toast("المنتج غير متوفر حاليًا", "⚠️");
      }
    });
  }

  /* ================= التوصيات الذكية ================= */

  function recCardHTML(p) {
    if (!p || !p.id) return "";
    const price = Number(p.price) || 0;
    const old = p.oldPrice && Number(p.oldPrice) > price
      ? '<span class="price-old">' + fmtPrice(p.oldPrice) + "</span>" : "";
    const img = p.icon || p.image || "🛒";
    const visual = /^(https?:\/\/|\/|data:image)/.test(img)
      ? '<img src="' + esc(img) + '" alt="" loading="lazy" />'
      : esc(img);
    const tint = p.tint || ["#f1f5f9", "#e2e8f0"];
    return (
      '<article class="rec-card">' +
        '<button type="button" class="p-open rec-visual" data-product="' + esc(p.id) + '" aria-label="عرض ' + esc(p.name) + '" style="--p1:' + esc(tint[0]) + ";--p2:" + esc(tint[1]) + '">' +
          (p.isNew ? '<span class="product-tag is-new">🆕</span>' : "") +
          '<span class="p-icon" aria-hidden="true">' + visual + "</span>" +
        "</button>" +
        '<div class="rec-body">' +
          '<button type="button" class="p-open rec-name" data-product="' + esc(p.id) + '">' + esc(p.name) + "</button>" +
          '<div class="price-row"><span class="price">' + fmtPrice(price) + "</span>" + old + "</div>" +
          '<button type="button" class="add-btn rec-add" data-add-product="' + esc(p.id) + '">＋ أضف</button>' +
        "</div>" +
      "</article>"
    );
  }

  function fillRecSection(secId, gridId, list) {
    const sec = document.getElementById(secId);
    const grid = document.getElementById(gridId);
    if (!sec || !grid) return;
    if (!list || !list.length) { sec.hidden = true; return; }
    sec.hidden = false;
    grid.innerHTML = list.map(recCardHTML).join("");
  }

  async function renderHomeRecs() {
    if (!document.getElementById("recPopularGrid") && !document.getElementById("recNewGrid") && !document.getElementById("recPersonalGrid")) return;
    const Recs = global.Basit.Recs;
    if (!Recs) return;
    try {
      const s = await Recs.getHomeSections();
      fillRecSection("recPopular", "recPopularGrid", s.popular);
      fillRecSection("recNew", "recNewGrid", s.fresh);
      fillRecSection("recPersonal", "recPersonalGrid", s.personal);
    } catch (e) { /* تُخفى الأقسام */ }
  }

  async function fillCartRecs() {
    const box = $("#cartRecs");
    if (!box) return;
    const Recs = global.Basit.Recs;
    if (!Recs) return;
    try {
      const ids = Cart.lines().filter((l) => l.kind === "product").map((l) => l.id);
      const list = await Recs.forCart(ids);
      if (!list.length || !document.getElementById("cartRecs")) return;
      box.hidden = false;
      box.innerHTML = "<h4>🛒 قبل ما تكمل طلبك</h4>" +
        '<div class="rec-grid rec-grid-sm">' + list.map(recCardHTML).join("") + "</div>";
    } catch (e) { /* تجاهل */ }
  }

  async function renderCheckoutRecs() {
    const sec = $("#coRecs");
    const grid = $("#coRecsGrid");
    if (!sec || !grid) return;
    const Recs = global.Basit.Recs;
    if (!Recs) return;
    try {
      const ids = Cart.lines().filter((l) => l.kind === "product").map((l) => l.id);
      const list = await Recs.forCart(ids);
      if (!list.length) { sec.hidden = true; return; }
      sec.hidden = false;
      grid.innerHTML = list.map(recCardHTML).join("");
    } catch (e) { sec.hidden = true; }
  }

  /* ================= عدّادات السلة ================= */

  function bumpCartBtn() {
    const btn = $("#cartOpenBtn");
    if (!btn) return;
    btn.classList.remove("bump");
    void btn.offsetWidth;
    btn.classList.add("bump");
  }

  function updateBadges() {
    const count = Cart.count(); // إجمالي القطع — وليس الأصناف
    ["#cartCount", "#cartCountMobile"].forEach((sel) => {
      const el = $(sel);
      if (el) {
        el.textContent = count;
        el.style.display = count > 0 ? "" : "none";
      }
    });
    const dc = $("#drawerCount");
    if (dc) dc.textContent = "(" + count + ")";
  }

  /* ================= درج السلة ================= */

  function openDrawer() {
    renderCart();
    const drawer = $("#cartDrawer");
    const overlay = $("#overlay");
    if (!drawer || !overlay) return;
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add("show");
      overlay.classList.add("show");
    });
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    const drawer = $("#cartDrawer");
    const overlay = $("#overlay");
    if (!drawer || !overlay) return;
    // لا نخفي الـ overlay إذا كانت هناك نافذة أخرى مفتوحة فوقه
    drawer.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => {
      drawer.hidden = true;
      if (global.Basit.Shop && global.Basit.Shop.isSheetOpen && global.Basit.Shop.isSheetOpen()) return;
      overlay.classList.remove("show");
      setTimeout(() => { overlay.hidden = true; }, 250);
    }, 280);
  }

  function onShopPage() {
    return !!document.getElementById("shopGrid");
  }

  function renderCart() {
    const body = $("#cartItems");
    const foot = $("#cartFoot");
    if (!body || !foot) return;
    const lines = Cart.lines();
    updateBadges();

    if (!lines.length) {
      body.innerHTML =
        '<div class="cart-empty"><span class="big" aria-hidden="true">🛒</span>' +
        "<strong>السلة فارغة</strong><p>ابدأ بإضافة المنتجات التي تحتاجها.</p></div>";
      foot.innerHTML =
        '<button type="button" class="btn btn-primary btn-block" data-browse-products>تصفح المنتجات ←</button>';
      return;
    }

    body.innerHTML = lines.map((l) =>
      '<div class="cart-line" data-line="' + esc(l.key) + '">' +
        '<span class="cl-visual" style="--p1:' + esc(l.tint[0]) + ";--p2:" + esc(l.tint[1]) + '" aria-hidden="true">' + esc(l.icon) + "</span>" +
        '<div class="cl-info"><div class="cl-name">' + esc(l.name) + "</div>" +
        '<div class="cl-price">' + fmtPrice(l.price) + (l.kind === "offer" ? " • عرض" : "") + "</div>" +
        '<div class="cl-total">' + fmtPrice(l.price * l.qty) + "</div></div>" +
        '<div class="cl-side">' +
          '<div class="stepper">' +
            '<button type="button" data-dec="' + esc(l.key) + '" aria-label="إنقاص كمية ' + esc(l.name) + '">−</button>' +
            "<b>" + l.qty + "</b>" +
            '<button type="button" data-inc="' + esc(l.key) + '" aria-label="زيادة كمية ' + esc(l.name) + '">+</button>' +
          "</div>" +
          '<button type="button" class="cl-remove" data-del="' + esc(l.key) + '" aria-label="حذف ' + esc(l.name) + ' من السلة">حذف 🗑️</button>' +
        "</div>" +
      "</div>"
    ).join("");

    const savings = Cart.savings();
    foot.innerHTML =
      '<div class="cart-recs" id="cartRecs" hidden></div>' +
      '<div class="total-row"><span>🧾 عدد المنتجات</span><output>' + Cart.count() + " قطعة</output></div>" +
      '<div class="total-row"><span>🛒 إجمالي المنتجات</span><output>' + fmtPrice(Cart.subtotal()) + "</output></div>" +
      (savings > 0
        ? '<div class="total-row is-save"><span>🎉 إجمالي التوفير</span><output>' + fmtPrice(savings) + "</output></div>"
        : "") +
      '<div class="total-row"><span>🚚 التوصيل</span><output class="pending">سيتم تحديده لاحقًا</output></div>' +
      '<p class="delivery-hint">خيار التوصيل سيتم تأكيده عند استكمال الطلب.</p>' +
      '<div class="total-row grand"><span>الإجمالي</span><output>' + fmtPrice(Cart.total()) + "</output></div>" +
      '<a class="btn btn-primary btn-block btn-lg" href="checkout.html">متابعة الطلب ←</a>' +
      '<button type="button" class="btn btn-ghost btn-block" id="clearCartBtn">تفريغ السلة</button>';
    fillCartRecs();
  }

  /* ================= نافذة تأكيد الطلب ================= */

  function openCheckout() {
    if (Cart.isEmpty()) {
      toast("سلتك فاضية — ضيف منتجات الأول", "🧺");
      return;
    }
    closeDrawer();
    renderCheckoutForm();
    const modal = $("#checkoutModal");
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("show"));
    document.body.style.overflow = "hidden";
  }

  function closeCheckout() {
    const modal = $("#checkoutModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => { modal.hidden = true; }, 300);
  }

  function renderCheckoutForm() {
    const body = $("#checkoutBody");
    if (!body) return;
    const lines = Cart.lines();
    const summary = lines.map((l) =>
      '<div class="summary-line"><span>' + esc(l.name) + " × " + l.qty + "</span><b>" + fmtPrice(l.price * l.qty) + "</b></div>"
    ).join("");

    body.innerHTML =
      '<form class="form-grid" id="orderForm" novalidate>' +
        '<div class="summary-box"><h4>📋 ملخص الطلب (' + Cart.count() + " قطعة)</h4>" +
          summary +
          '<div class="summary-total"><span>الإجمالي</span><output>' + fmtPrice(Cart.total()) + "</output></div>" +
        "</div>" +
        '<div class="field" data-field="name"><label for="fName">الاسم بالكامل <i>*</i></label>' +
          '<input id="fName" name="name" type="text" placeholder="مثال: أحمد محمد" autocomplete="name" />' +
          '<span class="err">من فضلك اكتب اسمك</span></div>' +
        '<div class="field" data-field="phone"><label for="fPhone">رقم الهاتف <i>*</i></label>' +
          '<input id="fPhone" name="phone" type="tel" inputmode="numeric" placeholder="01xxxxxxxxx" autocomplete="tel" dir="ltr" style="text-align:right" />' +
          '<span class="err">اكتب رقم مصري صحيح (11 رقم يبدأ بـ 01)</span></div>' +
        '<div class="field" data-field="address"><label for="fAddress">العنوان (مغاغة) <i>*</i></label>' +
          '<input id="fAddress" name="address" type="text" placeholder="الشارع / المنطقة / علامة مميزة" autocomplete="street-address" />' +
          '<span class="err">من فضلك اكتب عنوانك</span></div>' +
        '<div class="field"><label for="fNotes">ملاحظات (اختياري)</label>' +
          '<textarea id="fNotes" name="notes" placeholder="أي تفاصيل إضافية عن طلبك..."></textarea></div>' +
        '<p class="form-hint">📞 سيتم التواصل معك لتأكيد الطلب.</p>' +
        '<button type="submit" class="btn btn-primary btn-block btn-lg" id="submitOrderBtn">تأكيد الطلب ✅</button>' +
      "</form>";

    $("#orderForm").addEventListener("submit", handleOrderSubmit);
  }

  function validateField(name, value) {
    value = (value || "").trim();
    if (name === "name") return value.length >= 2;
    if (name === "phone") return /^01[0-9]{9}$/.test(value.replace(/[\s-]/g, ""));
    if (name === "address") return value.length >= 3;
    return true;
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim().replace(/[\s-]/g, ""),
      address: form.address.value.trim(),
      notes: form.notes.value.trim(),
    };

    let valid = true;
    ["name", "phone", "address"].forEach((key) => {
      const field = form.closest("#checkoutBody").querySelector('[data-field="' + key + '"]');
      const ok = validateField(key, data[key]);
      field.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) return;

    const btn = $("#submitOrderBtn");
    btn.disabled = true;
    btn.textContent = "جاري إرسال طلبك... ⏳";

    const payload = {
      customer: data,
      items: Cart.lines().map((l) => ({ kind: l.kind, id: l.id, name: l.name, price: l.price, qty: l.qty })),
      total: Cart.total(),
      savings: Cart.savings(),
      createdAt: new Date().toISOString(),
    };

    const result = await global.Basit.Api.submitOrder(payload);

    if (result.ok) {
      if (global.Basit.Recs) global.Basit.Recs.remember(data.phone, data.name);
      Cart.clear();
      updateBadges();
      renderSuccess(result.orderNo);
    } else {
      btn.disabled = false;
      btn.textContent = "تأكيد الطلب ✅";
      toast("حصلت مشكلة — حاول تاني", "⚠️");
    }
  }

  function renderSuccess(orderNo) {
    const body = $("#checkoutBody");
    if (!body) return;
    body.innerHTML =
      '<div class="success-view">' +
        '<div class="success-icon" aria-hidden="true">✅</div>' +
        "<h4>تم استلام طلبك بنجاح</h4>" +
        "<p>شكرًا لثقتك في أسواق البسيط 🙏<br />سيتم التواصل معك قريبًا لتأكيد الطلب.</p>" +
        '<div><span class="order-no">' + esc(orderNo) + "</span></div>" +
        '<p class="form-hint">💡 رقم تجريبي لأغراض العرض</p>' +
        '<div class="success-actions">' +
          '<button type="button" class="btn btn-primary btn-block" id="successCloseBtn">تمام، شكرًا 👍</button>' +
        "</div>" +
      "</div>";
    $("#successCloseBtn").addEventListener("click", closeCheckout);
  }

  /* ================= إضافة للسلة + فتح التفاصيل (تفويض عام) ================= */

  function handleGlobalClick(e) {
    // 1) فتح تفاصيل المنتج
    const opener = e.target.closest("[data-product]");
    if (opener) {
      // إذا كان المنتج داخل نافذة التفاصيل (ترشيحات) نبدّل المحتوى فقط
      openProduct(opener.dataset.product);
      return;
    }

    // 2) إضافة منتج
    const pBtn = e.target.closest("[data-add-product]");
    if (pBtn) {
      const result = Cart.add("product", pBtn.dataset.addProduct, 1);
      if (result === "added") {
        updateBadges();
        bumpCartBtn();
        toast("تمت إضافة المنتج للسلة ✓", "🛒");
        pBtn.classList.add("added");
        const original = pBtn.innerHTML;
        pBtn.innerHTML = "✔️ اتضافت!";
        setTimeout(() => { pBtn.classList.remove("added"); pBtn.innerHTML = original; }, 1100);
      } else if (result === "unavailable") {
        toast("المنتج غير متوفر حاليًا", "⚠️");
      } else {
        toast("تعذر إضافة المنتج", "⚠️");
      }
      return;
    }

    // 3) إضافة عرض
    const oBtn = e.target.closest("[data-add-offer]");
    if (oBtn) {
      const result = Cart.add("offer", oBtn.dataset.addOffer, 1);
      if (result === "added") {
        updateBadges();
        bumpCartBtn();
        toast("اتضاف العرض للسلة 🎉", "🔥");
      }
      return;
    }

    // 4) زر "تصفح المنتجات" من السلة الفارغة
    const browse = e.target.closest("[data-browse-products]");
    if (browse) {
      if (onShopPage()) {
        closeDrawer();
        if (global.Basit.Shop) global.Basit.Shop.resetAll();
        setTimeout(() => {
          const top = $("#shopTop");
          if (top) top.scrollIntoView({ behavior: "smooth" });
        }, 250);
      } else {
        window.location.href = "products.html";
      }
    }
  }

  /* ================= أحداث السلة والنوافذ ================= */

  function bindCartEvents() {
    const openBtn = $("#cartOpenBtn");
    const bottomBtn = $("#bottomCartBtn");
    const closeBtn = $("#cartCloseBtn");
    const overlay = $("#overlay");
    if (openBtn) openBtn.addEventListener("click", openDrawer);
    if (bottomBtn) bottomBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (overlay) overlay.addEventListener("click", () => {
      // يقفل الدرج أو شيت الفلاتر (صفحة المنتجات) أيهما مفتوح
      const drawer = $("#cartDrawer");
      if (drawer && !drawer.hidden && drawer.classList.contains("show")) closeDrawer();
      if (global.Basit.Shop && global.Basit.Shop.closeSheet) global.Basit.Shop.closeSheet();
    });
    $$("[data-open-cart]").forEach((b) => b.addEventListener("click", openDrawer));

    const drawer = $("#cartDrawer");
    if (drawer) drawer.addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]");
      const dec = e.target.closest("[data-dec]");
      const del = e.target.closest("[data-del]");
      if (inc) { Cart.setQty(inc.dataset.inc, currentQty(inc.dataset.inc) + 1); renderCart(); return; }
      if (dec) { Cart.setQty(dec.dataset.dec, currentQty(dec.dataset.dec) - 1); renderCart(); return; }
      if (del) { Cart.remove(del.dataset.del); renderCart(); toast("اتمسح من السلة", "🗑️"); return; }
      if (e.target.closest("#checkoutBtn")) { openCheckout(); return; }
      if (e.target.closest("#clearCartBtn")) { Cart.clear(); renderCart(); toast("السلة فضيت", "🧺"); }
    });

    const coClose = $("#checkoutCloseBtn");
    const coModal = $("#checkoutModal");
    if (coClose) coClose.addEventListener("click", closeCheckout);
    if (coModal) coModal.addEventListener("click", (e) => {
      if (e.target.id === "checkoutModal") closeCheckout();
    });

    const pdClose = $("#productCloseBtn");
    const pdModal = $("#productModal");
    if (pdClose) pdClose.addEventListener("click", closeProduct);
    if (pdModal) pdModal.addEventListener("click", (e) => {
      if (e.target.id === "productModal") closeProduct();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDrawer();
        closeCheckout();
        closeProduct();
        if (global.Basit.Shop && global.Basit.Shop.closeSheet) global.Basit.Shop.closeSheet();
      }
    });

    document.addEventListener("click", handleGlobalClick);
  }

  function currentQty(key) {
    const line = Cart.lines().find((l) => l.key === key);
    return line ? line.qty : 0;
  }

  /* ================= الهيدر والتنقل والظهور ================= */

  function bindScrollEffects() {
    const header = $("#siteHeader");
    if (header) {
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    // تمييز القسم النشط (الرئيسية فقط — العناصر غير الموجودة تُتجاهل)
    const ids = ["home", "products", "offers", "location"];
    const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (targets.length && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          $$(".nav-link").forEach((a) =>
            a.classList.toggle("is-active", a.getAttribute("href") === "#" + id));
          $$(".bn-item[data-nav]").forEach((b) =>
            b.classList.toggle("is-active", b.dataset.nav === id));
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      targets.forEach((sec) => observer.observe(sec));
    }

    // الظهور التدريجي
    const reveals = $$(".reveal");
    if (reveals.length && "IntersectionObserver" in window) {
      const revealObs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      reveals.forEach((el) => revealObs.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("is-visible"));
    }
  }

  /* ================= تهيئة الواجهة ================= */

  function init() {
    Cart.load();
    renderCategories();
    renderHomeFilters();
    renderHomeProducts();
    renderOffers();
    renderHomeRecs();
    updateBadges();
    bindCartEvents();
    bindScrollEffects();
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
  }

  global.Basit = global.Basit || {};
  global.Basit.UI = {
    init, toast, openDrawer, closeDrawer, openCheckout,
    openProduct, closeProduct, renderCart, updateBadges,
    productCardHTML, recCardHTML, renderCheckoutRecs, fmtPrice, esc,
  };
})(window);
