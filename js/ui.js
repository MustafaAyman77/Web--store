/* ==========================================================================
   أسواق البسيط — UI
   كل ما يخص العرض والتفاعل: بناء الأقسام/المنتجات/العروض، السلة،
   نافذة تأكيد الطلب، التنبيهات، والتنقل — مقسمة لدوال منظمة.
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

  /* ================= بناء الأقسام ================= */

  let activeCategory = "all";

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

    grid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-category]");
      if (!card) return;
      setCategoryFilter(card.dataset.category, true);
    });
  }

  /* ================= بناء فلاتر المنتجات ================= */

  function renderFilters() {
    const row = $("#filterRow");
    if (!row) return;
    const chips = [{ id: "all", name: "الكل", icon: "🛍️" }].concat(Data.categories);
    row.innerHTML = chips.map((c) =>
      '<button type="button" role="tab" class="chip' + (c.id === activeCategory ? " is-active" : "") +
      '" data-filter="' + esc(c.id) + '" aria-selected="' + (c.id === activeCategory) + '">' +
      "<span aria-hidden='true'>" + esc(c.icon) + "</span> " + esc(c.name) + "</button>"
    ).join("");

    row.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filter]");
      if (!chip) return;
      setCategoryFilter(chip.dataset.filter, false);
    });
  }

  function setCategoryFilter(catId, scrollToProducts) {
    activeCategory = catId;
    $$("#filterRow .chip").forEach((chip) => {
      const on = chip.dataset.filter === catId;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderProducts();
    if (scrollToProducts) {
      const target = $("#products");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ================= بناء المنتجات ================= */

  const ADD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  function badgeClass(tone) {
    if (tone === "hot") return "product-tag is-hot";
    if (tone === "new") return "product-tag is-new";
    return "product-tag";
  }

  function renderProducts() {
    const grid = $("#productGrid");
    if (!grid) return;
    const list = Data.productsByCategory(activeCategory);

    if (!list.length) {
      grid.innerHTML = '<p class="demo-note" role="note">لا توجد منتجات في هذا القسم حاليًا.</p>';
      return;
    }

    grid.innerHTML = list.map((p) => {
      const cat = Data.getCategory(p.category);
      const tag = p.badge
        ? '<span class="' + badgeClass(p.badge.tone) + '">' + esc(p.badge.text) + "</span>"
        : "";
      const old = p.oldPrice && p.oldPrice > p.price
        ? '<span class="price-old">' + fmtPrice(p.oldPrice) + "</span>"
        : "";
      return (
        '<article class="product-card">' +
          '<div class="product-visual" style="--p1:' + esc(p.tint[0]) + ";--p2:" + esc(p.tint[1]) + '">' +
            tag +
            '<span class="p-icon" aria-hidden="true">' + esc(p.icon) + "</span>" +
          "</div>" +
          '<div class="product-body">' +
            '<span class="product-cat">' + esc(cat ? cat.name : "") + "</span>" +
            '<h3 class="product-name">' + esc(p.name) + "</h3>" +
            '<p class="product-desc">' + esc(p.desc) + "</p>" +
            '<div class="product-foot">' +
              '<div class="price-row"><span class="price">' + fmtPrice(p.price) + "</span>" + old +
              (p.unit ? '<span class="price-unit">/ ' + esc(p.unit) + "</span>" : "") + "</div>" +
              '<button type="button" class="add-btn" data-add-product="' + esc(p.id) + '">' +
                ADD_SVG + " أضف للسلة" +
              "</button>" +
            "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");
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
            '<button type="button" class="btn btn-accent btn-block" data-add-offer="' + esc(o.id) + '">' +
              "🛒 أضف العرض للسلة" +
            "</button>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  /* ================= عدّادات السلة ================= */

  function bumpCartBtn() {
    const btn = $("#cartOpenBtn");
    if (!btn) return;
    btn.classList.remove("bump");
    void btn.offsetWidth; // إعادة تشغيل الأنيميشن
    btn.classList.add("bump");
  }

  function updateBadges() {
    const count = Cart.count();
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
    drawer.classList.remove("show");
    overlay.classList.remove("show");
    document.body.style.overflow = "";
    setTimeout(() => { drawer.hidden = true; overlay.hidden = true; }, 300);
  }

  function renderCart() {
    const body = $("#cartItems");
    const foot = $("#cartFoot");
    if (!body || !foot) return;
    const lines = Cart.lines();
    updateBadges();

    if (!lines.length) {
      body.innerHTML =
        '<div class="cart-empty"><span class="big" aria-hidden="true">🧺</span>' +
        "<strong>سلتك فاضية</strong><p>اختار اللي محتاجه من المنتجات والعروض.</p></div>";
      foot.innerHTML =
        '<button type="button" class="btn btn-primary btn-block" data-close-and-goto="#products">🛒 تصفح المنتجات</button>';
      return;
    }

    body.innerHTML = lines.map((l) =>
      '<div class="cart-line" data-line="' + esc(l.key) + '">' +
        '<span class="cl-visual" style="--p1:' + esc(l.tint[0]) + ";--p2:" + esc(l.tint[1]) + '" aria-hidden="true">' + esc(l.icon) + "</span>" +
        '<div class="cl-info"><div class="cl-name">' + esc(l.name) + "</div>" +
        '<div class="cl-price">' + fmtPrice(l.price) + (l.kind === "offer" ? " • عرض" : "") + "</div></div>" +
        '<div class="cl-side">' +
          '<div class="stepper">' +
            '<button type="button" data-dec="' + esc(l.key) + '" aria-label="إنقاص الكمية">−</button>' +
            "<b>" + l.qty + "</b>" +
            '<button type="button" data-inc="' + esc(l.key) + '" aria-label="زيادة الكمية">+</button>' +
          "</div>" +
          '<button type="button" class="cl-remove" data-del="' + esc(l.key) + '">حذف 🗑️</button>' +
        "</div>" +
      "</div>"
    ).join("");

    const savings = Cart.savings();
    foot.innerHTML =
      (savings > 0
        ? '<div class="total-row"><span>🎉 إجمالي التوفير</span><output>' + fmtPrice(savings) + "</output></div>"
        : "") +
      '<div class="total-row grand"><span>الإجمالي</span><output>' + fmtPrice(Cart.total()) + "</output></div>" +
      '<button type="button" class="btn btn-primary btn-block btn-lg" id="checkoutBtn">تأكيد الطلب ←</button>' +
      '<button type="button" class="btn btn-ghost btn-block" id="clearCartBtn">تفريغ السلة</button>';
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

    // تجهيز بيانات الطلب بصيغة موحدة — جاهزة للـ Backend لاحقًا
    const payload = {
      customer: data,
      items: Cart.lines().map((l) => ({ kind: l.kind, id: l.id, name: l.name, price: l.price, qty: l.qty })),
      total: Cart.total(),
      savings: Cart.savings(),
      createdAt: new Date().toISOString(),
    };

    const result = await global.Basit.Api.submitOrder(payload);

    if (result.ok) {
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

  /* ================= إضافة للسلة (تفويض الأحداث) ================= */

  function handleAddClick(e) {
    const pBtn = e.target.closest("[data-add-product]");
    const oBtn = e.target.closest("[data-add-offer]");
    if (!pBtn && !oBtn) return;

    let added = false;
    if (pBtn) {
      added = Cart.add("product", pBtn.dataset.addProduct, 1);
      if (added) {
        const p = Data.getProduct(pBtn.dataset.addProduct);
        toast("اتضافت للسلة: " + (p ? p.name : ""), "🛒");
        pBtn.classList.add("added");
        const original = pBtn.innerHTML;
        pBtn.innerHTML = "✔️ اتضافت!";
        setTimeout(() => { pBtn.classList.remove("added"); pBtn.innerHTML = original; }, 1200);
      }
    } else {
      added = Cart.add("offer", oBtn.dataset.addOffer, 1);
      if (added) toast("اتضاف العرض للسلة 🎉", "🔥");
    }
    if (added) {
      updateBadges();
      bumpCartBtn();
    }
  }

  /* ================= أحداث السلة والدرج ================= */

  function bindCartEvents() {
    $("#cartOpenBtn").addEventListener("click", openDrawer);
    $("#bottomCartBtn").addEventListener("click", openDrawer);
    $("#cartCloseBtn").addEventListener("click", closeDrawer);
    $("#overlay").addEventListener("click", closeDrawer);
    $$("[data-open-cart]").forEach((b) => b.addEventListener("click", openDrawer));

    $("#cartDrawer").addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]");
      const dec = e.target.closest("[data-dec]");
      const del = e.target.closest("[data-del]");
      const goto = e.target.closest("[data-close-and-goto]");
      if (inc) { Cart.setQty(inc.dataset.inc, currentQty(inc.dataset.inc) + 1); renderCart(); return; }
      if (dec) { Cart.setQty(dec.dataset.dec, currentQty(dec.dataset.dec) - 1); renderCart(); return; }
      if (del) { Cart.remove(del.dataset.del); renderCart(); toast("اتمسح من السلة", "🗑️"); return; }
      if (goto) {
        closeDrawer();
        setTimeout(() => {
          const t = $(goto.dataset.closeAndGoto);
          if (t) t.scrollIntoView({ behavior: "smooth" });
        }, 250);
        return;
      }
      if (e.target.closest("#checkoutBtn")) { openCheckout(); return; }
      if (e.target.closest("#clearCartBtn")) { Cart.clear(); renderCart(); toast("السلة فضيت", "🧺"); }
    });

    $("#checkoutCloseBtn").addEventListener("click", closeCheckout);
    $("#checkoutModal").addEventListener("click", (e) => {
      if (e.target.id === "checkoutModal") closeCheckout();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); closeCheckout(); }
    });

    document.addEventListener("click", handleAddClick);
  }

  function currentQty(key) {
    const line = Cart.lines().find((l) => l.key === key);
    return line ? line.qty : 0;
  }

  /* ================= الهيدر والتنقل ================= */

  function bindScrollEffects() {
    const header = $("#siteHeader");
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // تمييز القسم النشط في التنقل
    const map = [
      ["home", "home"], ["products", "products"], ["offers", "offers"], ["location", "location"],
    ];
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
    map.forEach(([id]) => {
      const sec = document.getElementById(id);
      if (sec) observer.observe(sec);
    });

    // الظهور التدريجي
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => revealObs.observe(el));
  }

  /* ================= تهيئة الواجهة ================= */

  function init() {
    Cart.load();
    renderCategories();
    renderFilters();
    renderProducts();
    renderOffers();
    updateBadges();
    bindCartEvents();
    bindScrollEffects();
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();
  }

  global.Basit = global.Basit || {};
  global.Basit.UI = { init, toast, openDrawer, openCheckout, setCategoryFilter, renderCart };
})(window);
