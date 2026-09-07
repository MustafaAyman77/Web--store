/* ==========================================================================
   أسواق البسيط — Shop (صفحة المنتجات products.html فقط)
   البحث اللحظي + الأقسام + الترتيب + الفلاتر (شريط جانبي / شيت سفلي).
   يعتمد على: BasitData (البيانات) + Basit.UI (الكارت الموحد والتنبيهات).
   ========================================================================== */
(function (global) {
  "use strict";

  const SORT_OPTIONS = [
    { value: "popular",    label: "الأكثر شيوعًا" },
    { value: "price-asc",  label: "السعر: من الأقل للأعلى" },
    { value: "price-desc", label: "السعر: من الأعلى للأقل" },
    { value: "newest",     label: "الأحدث" },
    { value: "offers",     label: "العروض" },
  ];

  const state = {
    q: "",
    cat: "all",
    sort: "popular",
    minPrice: "",
    maxPrice: "",
    offersOnly: false,
    availOnly: false,
  };

  let sheetOpen = false;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function isShopPage() {
    return !!document.getElementById("shopGrid");
  }

  /* ================= قراءة قسم من الرابط (?cat=) ================= */

  function readCatFromURL() {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get("cat");
      if (cat && global.BasitData.getCategory(cat)) state.cat = cat;
    } catch (e) { /* تجاهل */ }
  }

  /* ================= فلترة + ترتيب ================= */

  function getFiltered() {
    const Data = global.BasitData;
    let list = Data.productsByCategory(state.cat);

    if (state.q) list = list.filter((p) => Data.matchesQuery(p, state.q));

    const min = parseFloat(state.minPrice);
    const max = parseFloat(state.maxPrice);
    if (Number.isFinite(min)) list = list.filter((p) => Number(p.price) >= min);
    if (Number.isFinite(max)) list = list.filter((p) => Number(p.price) <= max);

    if (state.offersOnly) list = list.filter((p) => Data.hasDiscount(p));
    if (state.availOnly) list = list.filter((p) => p.available !== false);

    return Data.sortProducts(list, state.sort);
  }

  function activeFilterCount() {
    let n = 0;
    if (state.cat !== "all") n++;
    if (state.minPrice !== "" || state.maxPrice !== "") n++;
    if (state.offersOnly) n++;
    if (state.availOnly) n++;
    return n;
  }

  /* ================= عرض المنتجات ================= */

  function skeletonHTML() {
    let html = "";
    for (let i = 0; i < 6; i++) {
      html += '<div class="product-card skel" aria-hidden="true">' +
        '<div class="product-visual skel-block"></div>' +
        '<div class="product-body"><div class="skel-line w60"></div>' +
        '<div class="skel-line w90"></div><div class="skel-line w40"></div></div></div>';
    }
    return html;
  }

  function emptyHTML() {
    if (state.q) {
      return '<div class="shop-empty" role="status">' +
        '<span class="shop-empty-icon" aria-hidden="true">🔍</span>' +
        "<h3>لم نجد ما تبحث عنه.</h3>" +
        "<p>جرّب كلمة تانية أو تصفح كل المنتجات.</p>" +
        '<button type="button" class="btn btn-primary" data-shop-reset>عرض جميع المنتجات</button></div>';
    }
    const cat = global.BasitData.getCategory(state.cat);
    return '<div class="shop-empty" role="status">' +
      '<span class="shop-empty-icon" aria-hidden="true">📦</span>' +
      "<h3>لا توجد منتجات متاحة" + (cat ? " في قسم " + esc(cat.name) : "") + " حاليًا.</h3>" +
      "<p>جرّب تعديل الفلاتر أو تصفح باقي الأقسام.</p>" +
      '<button type="button" class="btn btn-primary" data-shop-reset>عرض جميع المنتجات</button></div>';
  }

  function esc(s) { return global.Basit.UI.esc(s); }

  function render() {
    const grid = $("#shopGrid");
    const count = $("#shopCount");
    if (!grid) return;
    const list = getFiltered();

    if (count) {
      count.textContent = list.length === 0
        ? "لا توجد نتائج"
        : "عرض " + list.length + " منتج";
    }
    grid.innerHTML = list.length ? list.map(global.Basit.UI.productCardHTML).join("") : emptyHTML();
    syncChips();
    syncFilterForms();
    updateFilterBadge();
  }

  /* ================= شرائح الأقسام ================= */

  function renderChips() {
    const row = $("#shopChips");
    if (!row) return;
    const Data = global.BasitData;
    const chips = [{ id: "all", name: "كل المنتجات", icon: "🛍️" }].concat(Data.categories);
    row.innerHTML = chips.map((c) =>
      '<button type="button" role="tab" class="chip" data-shop-cat="' + c.id + '">' +
      "<span aria-hidden='true'>" + c.icon + "</span> " + esc(c.name) + "</button>"
    ).join("");
    syncChips();

    row.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-shop-cat]");
      if (!chip) return;
      state.cat = chip.dataset.shopCat;
      render();
    });
  }

  function syncChips() {
    $$("#shopChips .chip").forEach((chip) => {
      const on = chip.dataset.shopCat === state.cat;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /* ================= نماذج الفلاتر (جانبي + شيت) ================= */

  function catOptionsHTML() {
    const Data = global.BasitData;
    const opts = [{ id: "all", name: "كل الأقسام" }].concat(Data.categories);
    return opts.map((c) =>
      '<label class="radio-row"><input type="radio" name="fcat" value="' + c.id + '" />' +
      "<span>" + esc(c.name) + "</span></label>"
    ).join("");
  }

  function filterFormInner(prefix) {
    return (
      '<div class="f-group"><h4>القسم</h4><div class="f-cats" data-f="cats">' + catOptionsHTML() + "</div></div>" +
      '<div class="f-group"><h4>السعر (ج.م)</h4>' +
        '<div class="f-price-row">' +
          '<label>من<input type="number" inputmode="numeric" min="0" data-f="min" placeholder="0" aria-label="السعر من" /></label>' +
          '<label>إلى<input type="number" inputmode="numeric" min="0" data-f="max" placeholder="الأقصى" aria-label="السعر إلى" /></label>' +
        "</div></div>" +
      '<div class="f-group"><h4>خيارات</h4>' +
        '<label class="check-row"><input type="checkbox" data-f="offers" /><span>🔥 العروض فقط</span></label>' +
        '<label class="check-row"><input type="checkbox" data-f="avail" /><span>✅ المتوفر فقط</span></label>' +
      "</div>" +
      '<div class="f-actions">' +
        '<button type="button" class="btn btn-primary btn-block" data-f-apply>تطبيق الفلاتر</button>' +
        '<button type="button" class="btn btn-ghost btn-block" data-f-clear>مسح الفلاتر</button>' +
      "</div>"
    );
  }

  function buildFilterForms() {
    const side = $("#filterSide");
    const sheet = $("#filterSheetBody");
    if (side) side.innerHTML = filterFormInner("side");
    if (sheet) sheet.innerHTML = filterFormInner("sheet");
    syncFilterForms();
  }

  /** مزامنة قيم النموذجين مع الحالة الحالية */
  function syncFilterForms() {
    ["#filterSide", "#filterSheetBody"].forEach((sel) => {
      const root = $(sel);
      if (!root) return;
      $$('input[name="fcat"]', root).forEach((r) => { r.checked = r.value === state.cat; });
      const min = $('[data-f="min"]', root);
      const max = $('[data-f="max"]', root);
      if (min) min.value = state.minPrice;
      if (max) max.value = state.maxPrice;
      const offers = $('[data-f="offers"]', root);
      const avail = $('[data-f="avail"]', root);
      if (offers) offers.checked = state.offersOnly;
      if (avail) avail.checked = state.availOnly;
    });
  }

  function applyFromForm(root) {
    const checked = $('input[name="fcat"]:checked', root);
    const min = $('[data-f="min"]', root);
    const max = $('[data-f="max"]', root);
    const offers = $('[data-f="offers"]', root);
    const avail = $('[data-f="avail"]', root);
    state.cat = checked ? checked.value : "all";
    state.minPrice = min ? min.value.trim() : "";
    state.maxPrice = max ? max.value.trim() : "";
    state.offersOnly = offers ? offers.checked : false;
    state.availOnly = avail ? avail.checked : false;
    // لو الحد الأدنى أكبر من الأقصى → نبدّلهما بدل تجاهل النتيجة
    const a = parseFloat(state.minPrice);
    const b = parseFloat(state.maxPrice);
    if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
      state.minPrice = String(b);
      state.maxPrice = String(a);
    }
    render();
  }

  function updateFilterBadge() {
    const badge = $("#filterBadge");
    if (!badge) return;
    const n = activeFilterCount();
    badge.textContent = n;
    badge.style.display = n > 0 ? "" : "none";
    const label = $("#filterCountLabel");
    if (label) label.textContent = n > 0 ? " (" + n + ")" : "";
  }

  function resetAll(scrollTop) {
    state.q = "";
    state.cat = "all";
    state.sort = "popular";
    state.minPrice = "";
    state.maxPrice = "";
    state.offersOnly = false;
    state.availOnly = false;
    const search = $("#shopSearch");
    const sort = $("#shopSort");
    if (search) search.value = "";
    if (sort) sort.value = "popular";
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("cat");
      window.history.replaceState({}, "", url);
    } catch (e) { /* تجاهل */ }
    render();
    if (scrollTop) {
      const top = $("#shopTop");
      if (top) top.scrollIntoView({ behavior: "smooth" });
    }
  }

  /* ================= الشيت السفلي (موبايل/تابلت) ================= */

  function openSheet() {
    const sheet = $("#filterSheet");
    const overlay = $("#overlay");
    if (!sheet || !overlay) return;
    syncFilterForms();
    sheet.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add("show");
      overlay.classList.add("show");
    });
    document.body.style.overflow = "hidden";
    sheetOpen = true;
  }

  function closeSheet() {
    if (!sheetOpen) return;
    const sheet = $("#filterSheet");
    const overlay = $("#overlay");
    if (!sheet || !overlay) return;
    sheet.classList.remove("show");
    document.body.style.overflow = "";
    sheetOpen = false;
    setTimeout(() => {
      sheet.hidden = true;
      const drawer = $("#cartDrawer");
      const drawerOpen = drawer && !drawer.hidden && drawer.classList.contains("show");
      if (!drawerOpen) {
        overlay.classList.remove("show");
        setTimeout(() => { overlay.hidden = true; }, 250);
      }
    }, 280);
  }

  /* ================= الربط ================= */

  function bind() {
    // البحث اللحظي
    const search = $("#shopSearch");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = search.value;
          render();
        }, 140);
      });
      const clearBtn = $("#searchClear");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        search.value = "";
        state.q = "";
        render();
        search.focus();
      });
    }

    // الترتيب
    const sort = $("#shopSort");
    if (sort) {
      sort.innerHTML = SORT_OPTIONS.map((o) =>
        '<option value="' + o.value + '">' + o.label + "</option>"
      ).join("");
      sort.value = state.sort;
      sort.addEventListener("change", () => {
        state.sort = sort.value;
        render();
      });
    }

    // أزرار تطبيق/مسح داخل النموذجين
    document.addEventListener("click", (e) => {
      const apply = e.target.closest("[data-f-apply]");
      if (apply) {
        const root = apply.closest("#filterSide, #filterSheetBody");
        if (root) applyFromForm(root);
        closeSheet();
        const n = getFiltered().length;
        global.Basit.UI.toast(n > 0 ? "تم تطبيق الفلاتر ✓" : "لا توجد نتائج مطابقة", n > 0 ? "✅" : "🔍");
        return;
      }
      const clear = e.target.closest("[data-f-clear]");
      if (clear) { resetAll(false); return; }
      if (e.target.closest("[data-shop-reset]")) { resetAll(false); }
    });

    // زر التصفية (موبايل/تابلت) + إغلاق الشيت
    const filterBtn = $("#filterOpenBtn");
    if (filterBtn) filterBtn.addEventListener("click", openSheet);
    const sheetClose = $("#sheetCloseBtn");
    if (sheetClose) sheetClose.addEventListener("click", closeSheet);
  }

  function init() {
    if (!isShopPage()) return;
    readCatFromURL();
    renderChips();
    buildFilterForms();
    bind();
    // حالة تحميل خفيفة أول مرة ثم العرض
    const grid = $("#shopGrid");
    if (grid) grid.innerHTML = skeletonHTML();
    updateFilterBadge();
    setTimeout(render, 320);
  }

  global.Basit = global.Basit || {};
  global.Basit.Shop = { init, resetAll, openSheet, closeSheet, isSheetOpen: () => sheetOpen };
})(window);
