/* ==========================================================================
   أسواق البسيط — Shop (صفحة المنتجات products.html فقط)
   البحث اللحظي + الأقسام + الترتيب + الفلاتر (شريط جانبي / شيت سفلي).
   يعتمد على: BasitData (البيانات) + Basit.UI (الكارت الموحد والتنبيهات).
   ========================================================================== */
(function (global) {
  "use strict";

  const SORT_OPTIONS = [
    { value: "relevance",  label: "الأكثر صلة" },
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
    page: 1,
    total: 0,
  };

  let sheetOpen = false;
  let searchBackend = false; // البحث الخلفي متاح؟
  let searchSeq = 0;         // إلغاء الاستجابات المتأخرة
  let suggestSeq = 0;
  let currentItems = [];     // نتائج البحث الحالية (للترقيم)
  let didYouMean = null;
  let suggestItems = [];     // عناصر القائمة المنسدلة
  let suggestActive = -1;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function isShopPage() {
    return !!document.getElementById("shopGrid");
  }

  /* ================= قراءة قسم من الرابط (?cat=) ================= */

  function readStateFromURL() {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get("cat");
      if (cat && global.BasitData.getCategory(cat)) state.cat = cat;
      const q = (params.get("q") || "").trim().slice(0, 60);
      if (q) { state.q = q; state.sort = "relevance"; }
      const sort = params.get("sort");
      if (sort && SORT_OPTIONS.some((o) => o.value === sort)) state.sort = sort;
    } catch (e) { /* تجاهل */ }
  }

  function syncURL() {
    try {
      const url = new URL(window.location.href);
      if (state.q.trim()) url.searchParams.set("q", state.q.trim());
      else url.searchParams.delete("q");
      if (state.cat !== "all") url.searchParams.set("cat", state.cat);
      else url.searchParams.delete("cat");
      window.history.replaceState({}, "", url);
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

  function useBackendSearch() {
    return searchBackend && !!state.q.trim();
  }

  function backendSort() {
    if (state.sort === "offers") return "relevance"; // + offer=1 بالإجبار أدناه
    return ["relevance", "newest", "popular", "price-asc", "price-desc"].includes(state.sort)
      ? state.sort : "relevance";
  }

  function render() {
    syncURL();
    if (useBackendSearch()) { runBackendSearch(false); return; }
    hideSearchExtras();
    state.total = 0;
    currentItems = [];
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

  function hideSearchExtras() {
    didYouMean = null;
    const c = $("#searchCorrect");
    if (c) { c.hidden = true; c.innerHTML = ""; }
    const w = $("#loadMoreWrap");
    if (w) w.hidden = true;
  }

  /** تنفيذ البحث الخلفي — reset=false للصفحة الأولى، ودمج عند "عرض المزيد" */
  function runBackendSearch(append) {
    const grid = $("#shopGrid");
    const count = $("#shopCount");
    if (!grid) return;
    if (!append) {
      state.page = 1;
      currentItems = [];
      grid.innerHTML = skeletonHTML();
      if (count) count.textContent = "جاري البحث...";
    }
    hideSearchExtras();
    const seq = ++searchSeq;
    const q = state.q.trim();
    const S = global.Basit.Search;
    S.query({
      q,
      category: state.cat,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      available: state.availOnly,
      offer: state.offersOnly || state.sort === "offers",
      sort: backendSort(),
      page: state.page,
      limit: 20,
    }).then((d) => {
      if (seq !== searchSeq) return;
      state.total = d.total;
      didYouMean = d.didYouMean || null;
      const mapped = (d.results || []).map(global.Basit.Api.mapProduct);
      global.BasitData._upsertProducts(mapped);
      currentItems = append ? currentItems.concat(mapped) : mapped;
      if (count) {
        count.textContent = state.total === 0
          ? "لا توجد نتائج عن «" + q + "»"
          : "نتيجة البحث عن «" + q + "»: " + state.total + " منتج";
      }
      if (!currentItems.length) {
        grid.innerHTML = zeroResultsHTML(q);
        fillZeroExtras();
      } else {
        grid.innerHTML = currentItems.map(global.Basit.UI.productCardHTML).join("");
      }
      renderCorrection();
      updateLoadMore();
      S.saveRecent(q);
      syncChips();
      syncFilterForms();
      updateFilterBadge();
    }).catch((err) => {
      if (seq !== searchSeq) return;
      if (count) count.textContent = "تعذر إتمام البحث";
      grid.innerHTML = '<div class="shop-empty" role="alert">' +
        '<span class="shop-empty-icon" aria-hidden="true">⚠️</span>' +
        "<h3>حدث خطأ أثناء البحث.</h3><p>" + esc((err && err.message) || "حاول مرة أخرى.") + "</p>" +
        '<button type="button" class="btn btn-primary" data-shop-retry>إعادة المحاولة</button></div>';
    });
  }

  function updateLoadMore() {
    const wrap = $("#loadMoreWrap");
    if (!wrap) return;
    if (currentItems.length < state.total) {
      wrap.hidden = false;
      const btn = wrap.querySelector("[data-load-more]");
      if (btn) btn.textContent = "عرض المزيد (" + currentItems.length + " من " + state.total + ")";
    } else {
      wrap.hidden = true;
    }
  }

  function renderCorrection() {
    const box = $("#searchCorrect");
    if (!box) return;
    if (!didYouMean || currentItems.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = '<span>«هل تقصد: <b>' + esc(didYouMean) + "؟»</span> " +
      '<button type="button" class="btn btn-outline btn-sm" data-apply-correction>عرض النتائج</button>';
  }

  /* ---------- صفر نتائج: رسالة لطيفة + بدائل حقيقية ---------- */

  function zeroResultsHTML(q) {
    return '<div class="shop-empty" role="status">' +
      '<span class="shop-empty-icon" aria-hidden="true">🔍</span>' +
      "<h3>لم نجد المنتج الذي تبحث عنه.</h3>" +
      '<p>جرّب كتابة اسم مختلف عن «' + esc(q) + "».</p>" +
      '<button type="button" class="btn btn-primary" data-shop-reset>عرض جميع المنتجات</button></div>' +
      '<div class="zero-extra" id="zeroMaybe" hidden><h4>💡 ممكن يعجبك</h4><div class="product-grid" id="zeroMaybeGrid"></div></div>' +
      '<div class="zero-extra" id="zeroPopular" hidden><h4>🔥 الأكثر بحثًا</h4><div class="chip-row" id="zeroPopularChips"></div></div>' +
      '<div class="zero-extra"><a class="btn btn-accent btn-block" href="offers.html">🔥 تصفح عروض اليوم</a></div>';
  }

  function fillZeroExtras() {
    try {
      const Recs = global.Basit.Recs;
      if (Recs && Recs.personal) {
        Recs.personal(4).then((list) => {
          const box = $("#zeroMaybe");
          const grid = $("#zeroMaybeGrid");
          if (!box || !grid || !list || !list.length) return;
          global.BasitData._upsertProducts(list);
          grid.innerHTML = list.map(global.Basit.UI.productCardHTML).join("");
          box.hidden = false;
        }).catch(() => {});
      }
      const S = global.Basit.Search;
      if (S && S.popular) {
        S.popular().then((rows) => {
          const box = $("#zeroPopular");
          const chips = $("#zeroPopularChips");
          if (!box || !chips || !rows || !rows.length) return;
          chips.innerHTML = rows.slice(0, 6).map((r) =>
            '<button type="button" class="chip" data-zero-q="' + esc(r.query) + '">🔥 ' + esc(r.query) + "</button>").join("");
          box.hidden = false;
        }).catch(() => {});
      }
    } catch (e) { /* تجاهل — تبقى الرسالة الأساسية */ }
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
      state.page = 1;
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
    state.page = 1;
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
    state.page = 1;
    state.total = 0;
    currentItems = [];
    closeSuggest();
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

  /* ================= الاقتراحات + السجل + الأكثر بحثًا ================= */

  function dropEl() { return $("#searchDrop"); }
  function dropListEl() { return $("#searchDropList"); }

  function closeSuggest() {
    const d = dropEl();
    if (d) d.hidden = true;
    const input = $("#shopSearch");
    if (input) input.setAttribute("aria-expanded", "false");
    suggestItems = [];
    suggestActive = -1;
  }

  function openSuggest(items, showClear) {
    const d = dropEl();
    const list = dropListEl();
    if (!d || !list) return;
    suggestItems = items || [];
    suggestActive = -1;
    if (!suggestItems.length && !showClear) { closeSuggest(); return; }
    list.innerHTML = suggestItems.map((it, i) =>
      '<li role="option" id="sg-' + i + '" data-sg="' + i + '" aria-selected="false">' +
      '<span class="sg-icon" aria-hidden="true">' + it.icon + "</span>" +
      "<span>" + esc(it.text) + "</span>" +
      (it.hint ? '<small class="sg-hint">' + esc(it.hint) + "</small>" : "") +
      "</li>").join("") +
      (showClear ? '<li class="sg-clear" data-sg-clear><span aria-hidden="true">🗑️</span><span>مسح سجل البحث</span></li>' : "");
    d.hidden = false;
    const input = $("#shopSearch");
    if (input) input.setAttribute("aria-expanded", "true");
  }

  function paintSuggestActive() {
    $$("#searchDropList [data-sg]").forEach((li) => {
      const on = Number(li.dataset.sg) === suggestActive;
      li.classList.toggle("is-active", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
    const input = $("#shopSearch");
    if (input) input.setAttribute("aria-activedescendant", suggestActive >= 0 ? "sg-" + suggestActive : "");
  }

  function activateSuggest(item) {
    if (!item) return;
    closeSuggest();
    const input = $("#shopSearch");
    if (item.kind === "product" && item.productId) {
      const p = global.BasitData.getProduct(item.productId);
      if (p) { global.Basit.UI.openProduct(item.productId); return; }
    }
    if (item.kind === "category" && item.category) {
      state.cat = item.category;
      state.q = "";
      if (input) input.value = "";
      state.sort = "popular";
      const sort = $("#shopSort");
      if (sort) sort.value = "popular";
      render();
      return;
    }
    state.q = item.text;
    if (input) input.value = item.text;
    state.sort = "relevance";
    const sort = $("#shopSort");
    if (sort) sort.value = "relevance";
    render();
    $("#shopGrid").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** محتوى القائمة عند التركيز بدون كتابة: السجل ثم الأكثر بحثًا */
  function showDropHome() {
    if (!searchBackend) return;
    const S = global.Basit.Search;
    const items = S.getRecent().slice(0, 5).map((t) => ({ kind: "recent", text: t, icon: "🕐" }));
    const hasRecent = items.length > 0;
    S.popular().then((rows) => {
      if (document.activeElement !== $("#shopSearch")) return; // المستخدم غادر الحقل
      (rows || []).slice(0, 4).forEach((r) => {
        if (!items.some((x) => x.text === r.query)) items.push({ kind: "popular", text: r.query, icon: "🔥" });
      });
      openSuggest(items, hasRecent);
    }).catch(() => {
      if (document.activeElement === $("#shopSearch")) openSuggest(items, hasRecent);
    });
  }

  function refreshSuggest(text) {
    if (!searchBackend) { closeSuggest(); return; }
    const q = String(text || "").trim();
    if (!q) { showDropHome(); return; }
    const seq = ++suggestSeq;
    global.Basit.Search.suggest(q, 6).then((rows) => {
      if (seq !== suggestSeq) return;
      openSuggest((rows || []).map((r) => ({
        kind: r.type === "category" ? "category" : "product",
        text: r.text, icon: r.type === "category" ? "📁" : "🔍",
        hint: r.type === "category" ? "قسم" : "",
        productId: r.productId, category: r.category,
      })), false);
    }).catch(() => { if (seq === suggestSeq) closeSuggest(); });
  }

  /* ================= الربط ================= */

  function bind() {
    // البحث اللحظي + الاقتراحات
    const search = $("#shopSearch");
    if (search) {
      let timer = null;
      let sgTimer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        clearTimeout(sgTimer);
        sgTimer = setTimeout(() => refreshSuggest(search.value), 160);
        timer = setTimeout(() => {
          state.q = search.value;
          state.page = 1;
          render();
        }, searchBackend && search.value.trim() ? 450 : 140);
      });
      search.addEventListener("focus", () => {
        if (!search.value.trim()) showDropHome();
        else refreshSuggest(search.value);
      });
      search.addEventListener("keydown", (e) => {
        const d = dropEl();
        const open = d && !d.hidden && suggestItems.length;
        if (e.key === "Escape") { closeSuggest(); return; }
        if (!open) {
          if (e.key === "Enter") { e.preventDefault(); state.q = search.value; state.page = 1; render(); }
          return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); suggestActive = (suggestActive + 1) % suggestItems.length; paintSuggestActive(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); suggestActive = (suggestActive - 1 + suggestItems.length) % suggestItems.length; paintSuggestActive(); }
        else if (e.key === "Enter") { e.preventDefault(); activateSuggest(suggestItems[suggestActive]); }
      });
      const clearBtn = $("#searchClear");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        search.value = "";
        state.q = "";
        state.page = 1;
        closeSuggest();
        render();
        search.focus();
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-box")) closeSuggest();
      });
      const drop = dropEl();
      if (drop) drop.addEventListener("click", (e) => {
        if (e.target.closest("[data-sg-clear]")) {
          global.Basit.Search.clearRecent();
          showDropHome();
          return;
        }
        const li = e.target.closest("[data-sg]");
        if (li) activateSuggest(suggestItems[Number(li.dataset.sg)]);
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
        state.page = 1;
        render();
      });
    }

    // أزرار تطبيق/مسح داخل النموذجين + البحث
    document.addEventListener("click", (e) => {
      const apply = e.target.closest("[data-f-apply]");
      if (apply) {
        const root = apply.closest("#filterSide, #filterSheetBody");
        if (root) applyFromForm(root);
        closeSheet();
        const n = useBackendSearch() ? state.total : getFiltered().length;
        global.Basit.UI.toast(n > 0 ? "تم تطبيق الفلاتر ✓" : "لا توجد نتائج مطابقة", n > 0 ? "✅" : "🔍");
        return;
      }
      const clear = e.target.closest("[data-f-clear]");
      if (clear) { resetAll(false); return; }
      if (e.target.closest("[data-shop-reset]")) { resetAll(false); return; }
      if (e.target.closest("[data-shop-retry]")) { render(); return; }
      if (e.target.closest("[data-load-more]")) {
        state.page += 1;
        runBackendSearch(true);
        return;
      }
      if (e.target.closest("[data-apply-correction]")) {
        if (didYouMean) {
          state.q = didYouMean;
          const input = $("#shopSearch");
          if (input) input.value = didYouMean;
          state.page = 1;
          render();
        }
        return;
      }
      const zq = e.target.closest("[data-zero-q]");
      if (zq) {
        state.q = zq.dataset.zeroQ;
        const input = $("#shopSearch");
        if (input) input.value = state.q;
        state.page = 1;
        render();
      }
    });

    // زر التصفية (موبايل/تابلت) + إغلاق الشيت
    const filterBtn = $("#filterOpenBtn");
    if (filterBtn) filterBtn.addEventListener("click", openSheet);
    const sheetClose = $("#sheetCloseBtn");
    if (sheetClose) sheetClose.addEventListener("click", closeSheet);
  }

  function init() {
    if (!isShopPage()) return;
    readStateFromURL();
    renderChips();
    buildFilterForms();
    bind();
    // حالة تحميل خفيفة أول مرة ثم العرض
    const grid = $("#shopGrid");
    if (grid) grid.innerHTML = skeletonHTML();
    updateFilterBadge();
    const input = $("#shopSearch");
    if (input && state.q) input.value = state.q;
    const sort = $("#shopSort");
    if (sort) sort.value = state.sort;
    const boot = () => setTimeout(render, 120);
    try {
      if (global.Basit.Search) {
        global.Basit.Search.backendReady().then((ok) => { searchBackend = !!ok; boot(); }).catch(boot);
      } else boot();
    } catch (e) { boot(); }
    setTimeout(render, 2500); // أمان: عرض إجباري
  }

  global.Basit = global.Basit || {};
  global.Basit.Shop = { init, resetAll, openSheet, closeSheet, isSheetOpen: () => sheetOpen };
})(window);
