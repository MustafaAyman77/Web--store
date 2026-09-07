/* ==========================================================================
   أسواق البسيط — Checkout (صفحة إتمام الطلب checkout.html فقط)
   ملخص حي من السلة + نموذج بيانات + توصيل/استلام + مراجعة + تأكيد.
   يعتمد على: Basit.Cart (السلة) + Basit.Orders (بناء الطلب وإرساله Demo).
   ========================================================================== */
(function (global) {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);

  let Cart, UI, Orders, Store;
  let fulfillment = "delivery";
  let submitting = false;
  let zoneId = "";
  let quoteCache = null;
  let quoteTimer = null;

  function onPage() {
    return !!document.getElementById("coContent");
  }

  /* ================= الهاتف المصري ================= */

  /** تحويل الأرقام العربية المشرقية + تنظيف الصيغ الشائعة (+20 / 0020) */
  function normalizePhone(raw) {
    let s = String(raw || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    s = s.replace(/[\s\-().]/g, "");
    if (s.indexOf("+20") === 0) s = "0" + s.slice(3);
    else if (s.indexOf("0020") === 0) s = "0" + s.slice(4);
    return s;
  }

  /** فحص صريح (طول + بداية + بادئة الشبكة) — وليس Regex وحده */
  function phoneError(raw) {
    const s = normalizePhone(raw);
    const invalid = "من فضلك أدخل رقم هاتف مصري صحيح.";
    if (!s) return "من فضلك أدخل رقم الهاتف.";
    if (!/^[0-9]+$/.test(s)) return invalid;
    if (s.length !== 11) return invalid;
    if (s.slice(0, 2) !== "01") return invalid;
    if ("0125".indexOf(s[2]) === -1) return invalid; // 010 / 011 / 012 / 015
    return "";
  }

  /* ================= الملخص ================= */

  function showEmpty(on) {
    const empty = $("#emptyState");
    const content = $("#coContent");
    if (empty) empty.hidden = !on;
    if (content) content.hidden = on;
  }

  function renderSummary() {
    const wrap = $("#coSummary");
    if (!wrap) return;
    const lines = Cart.lines();
    if (!lines.length) { showEmpty(true); return; }
    showEmpty(false);

    const rows = lines.map((l) =>
      '<div class="summary-line"><span>' + UI.esc(l.name) + " × " + l.qty +
      "</span><b>" + UI.fmtPrice(l.price * l.qty) + "</b></div>"
    ).join("");

    wrap.innerHTML =
      "<h3>🧾 ملخص طلبك</h3>" +
      '<div class="co-lines">' + rows + "</div>" +
      '<div class="total-row"><span>🛒 إجمالي المنتجات</span><output>' + UI.fmtPrice(Cart.subtotal()) + "</output></div>" +
      (Cart.savings() > 0
        ? '<div class="total-row is-save"><span>🎉 التوفير</span><output>' + UI.fmtPrice(Cart.savings()) + "</output></div>"
        : "") +
      '<div class="total-row"><span id="coShipLabel">🚚 التوصيل</span><output id="coShipVal" class="pending">—</output></div>' +
      '<div class="total-row grand"><span>الإجمالي</span><output id="coGrandVal">' + UI.fmtPrice(Cart.total()) + "</output></div>" +
      '<button type="button" class="btn btn-outline btn-block" data-edit-cart>🛠️ تعديل السلة</button>';
    refreshQuote();
  }

  function quoteItems() {
    return Cart.lines().map((l) => ({ productId: l.id, quantity: l.qty }));
  }

  /** عرض السعر من السيرفر (نفس حساب الإنشاء) — يُحدَّث مع كل تغيير */
  function refreshQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(async () => {
      const shipVal = document.getElementById("coShipVal");
      const shipLabel = document.getElementById("coShipLabel");
      const grandVal = document.getElementById("coGrandVal");
      if (!shipVal || !grandVal) return;
      try {
        if (!Store) throw new Error("no store");
        const q = await Store.quote(quoteItems(), fulfillment, fulfillment === "delivery" ? zoneId : "");
        quoteCache = q;
        if (shipLabel) shipLabel.textContent = fulfillment === "pickup" ? "🏪 الاستلام" : "🚚 التوصيل";
        if (fulfillment === "pickup" || q.deliveryFee === null || q.deliveryFee === undefined) {
          shipVal.textContent = fulfillment === "pickup" ? "من المحل" : "—";
        } else {
          shipVal.textContent = q.deliveryFee === 0 ? "مجانًا 🎉" : UI.fmtPrice(q.deliveryFee);
        }
        shipVal.classList.remove("pending");
        grandVal.textContent = UI.fmtPrice(q.total);
      } catch (e) {
        quoteCache = null;
        if (fulfillment === "pickup") {
          if (shipLabel) shipLabel.textContent = "🏪 الاستلام";
          shipVal.textContent = "من المحل";
          shipVal.classList.remove("pending");
        } else {
          if (shipLabel) shipLabel.textContent = "🚚 التوصيل";
          const z = Store ? Store.zoneById(zoneId) : null;
          if (z) { shipVal.textContent = "~ " + UI.fmtPrice(z.deliveryFee); }
          else { shipVal.textContent = "اختر المنطقة"; }
          shipVal.classList.add("pending");
        }
        grandVal.textContent = UI.fmtPrice(Cart.total());
      }
      renderReview();
    }, 250);
  }

  /* ================= قراءة النموذج والمراجعة ================= */

  function formValues() {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    return {
      name: v("coName"),
      phone: v("coPhone"),
      address: v("coAddress"),
      area: v("coArea"),
      landmark: v("coLandmark"),
      notes: v("coNotes"),
    };
  }

  function fullAddress(vals) {
    if (fulfillment === "pickup") return "";
    return [vals.address, vals.area, vals.landmark].filter(Boolean).join(" — ");
  }

  function renderReview() {
    const wrap = $("#coReview");
    if (!wrap) return;
    const vals = formValues();
    const addr = fullAddress(vals);
    const cell = (text) => text
      ? '<span class="rv">' + UI.esc(text) + "</span>"
      : '<span class="rv is-empty">—</span>';

    wrap.innerHTML =
      "<h3>👀 راجع طلبك</h3>" +
      '<div class="review-rows">' +
      '<div class="review-row"><span class="rk">👤 الاسم</span>' + cell(vals.name) + "</div>" +
      '<div class="review-row"><span class="rk">📞 الهاتف</span>' + cell(vals.phone) + "</div>" +
      '<div class="review-row"><span class="rk">🚚 الاستلام</span><span class="rv">' +
        (fulfillment === "pickup" ? "🏪 استلام من المحل" : "🚚 توصيل للمنزل") + "</span></div>" +
      (fulfillment === "delivery" && Store && Store.zoneById(zoneId)
        ? '<div class="review-row"><span class="rk">🗺️ المنطقة</span><span class="rv">' + UI.esc(Store.zoneById(zoneId).name) + "</span></div>"
        : "") +
      (fulfillment === "delivery"
        ? '<div class="review-row"><span class="rk">📍 العنوان</span>' + cell(addr) + "</div>"
        : "") +
      '<div class="review-row"><span class="rk">🛍️ المنتجات</span><span class="rv">' +
        Cart.count() + " قطعة</span></div>" +
      '<div class="review-row"><span class="rk">💰 الإجمالي</span><span class="rv is-total">' +
        UI.fmtPrice(quoteCache && quoteCache.total !== undefined ? quoteCache.total : Cart.total()) + "</span></div>" +
      '<div class="review-row"><span class="rk">📌 الملاحظات</span>' + cell(vals.notes) + "</div>" +
      "</div>";
  }

  /* ================= طريقة الاستلام ================= */

  function applyFulfillment() {
    const group = $("#addressGroup");
    const isDelivery = fulfillment === "delivery";
    if (group) {
      group.hidden = !isDelivery;
      ["coAddress", "coArea", "coLandmark"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isDelivery;
      });
      if (!isDelivery) clearFieldError(document.getElementById("coAddress"));
    }
    document.querySelectorAll(".fulfill-card").forEach((card) => {
      const input = card.querySelector('input[name="fulfill"]');
      card.classList.toggle("is-selected", !!input && input.checked);
    });
    renderReview();
  }

  /* ================= التحقق ================= */

  function fieldWrap(input) {
    return input ? input.closest(".field") : null;
  }

  function setFieldError(input, message) {
    const wrap = fieldWrap(input);
    if (!wrap || !input) return;
    wrap.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    let err = wrap.querySelector(".err");
    if (!err) {
      err = document.createElement("span");
      err.className = "err";
      wrap.appendChild(err);
    }
    err.textContent = message;
    if (!input.id) return;
    err.id = input.id + "-error";
    input.setAttribute("aria-describedby", err.id);
  }

  function clearFieldError(input) {
    const wrap = fieldWrap(input);
    if (!wrap || !input) return;
    wrap.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }

  function validate() {
    const vals = formValues();
    let firstInvalid = null;
    const fail = (id, msg) => {
      const input = document.getElementById(id);
      setFieldError(input, msg);
      if (!firstInvalid && input) firstInvalid = input;
    };

    const nameInput = document.getElementById("coName");
    clearFieldError(nameInput);
    if (!vals.name || vals.name.replace(/\s+/g, " ").trim().length < 3) {
      fail("coName", "من فضلك أدخل اسمك بالكامل.");
    }

    const phoneInput = document.getElementById("coPhone");
    clearFieldError(phoneInput);
    const perr = phoneError(vals.phone);
    if (perr) fail("coPhone", perr);

    if (fulfillment === "delivery") {
      const zoneInput = document.getElementById("coZone");
      clearFieldError(zoneInput);
      if (!zoneId || !(Store && Store.zoneById(zoneId))) {
        fail("coZone", "من فضلك اختر منطقة التوصيل.");
      }
      const addrInput = document.getElementById("coAddress");
      clearFieldError(addrInput);
      if (!vals.address || vals.address.length < 5) {
        fail("coAddress", "من فضلك اكتب عنوان التوصيل.");
      }
    }

    return { ok: !firstInvalid, firstInvalid };
  }

  function showFormError(message) {
    const box = $("#formError");
    if (!box) return;
    box.innerHTML = '<span aria-hidden="true">⚠️</span><span>' + UI.esc(message) + "</span>";
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideFormError() {
    const box = $("#formError");
    if (box) box.hidden = true;
  }

  function setLoading(on) {
    const btn = $("#confirmBtn");
    if (!btn) return;
    btn.classList.toggle("is-loading", on);
    btn.disabled = on;
    btn.innerHTML = on
      ? '<span class="spinner" aria-hidden="true"></span> جاري تأكيد الطلب...'
      : "✅ تأكيد الطلب";
  }

  /* ================= التأكيد ================= */

  async function onConfirm() {
    if (submitting) return; // منع الطلبات المكررة
    hideFormError();

    if (Cart.isEmpty()) { renderSummary(); return; }

    const v = validate();
    renderReview();
    if (!v.ok) {
      v.firstInvalid.focus({ preventScroll: true });
      v.firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitting = true;
    setLoading(true);

    try {
      const vals = formValues();
      const built = Orders.createOrderPayload({
        customer: {
          name: vals.name,
          phone: normalizePhone(vals.phone),
          address: fulfillment === "delivery" ? vals.address : "",
          area: fulfillment === "delivery" ? vals.area : "",
          landmark: fulfillment === "delivery" ? vals.landmark : "",
        },
        fulfillmentMethod: fulfillment,
        deliveryZoneId: fulfillment === "delivery" ? zoneId : "",
        notes: vals.notes,
      });

      if (!built.ok) {
        if (built.code === "UNAVAILABLE" || built.code === "INVALID") {
          showFormError("أحد المنتجات في طلبك لم يعد متوفرًا.");
          renderSummary();
          renderReview();
        } else if (built.code === "EMPTY") {
          renderSummary();
        } else {
          showFormError("حدث خطأ أثناء تأكيد الطلب. من فضلك حاول مرة أخرى.");
        }
        submitting = false;
        setLoading(false);
        return;
      }

      const res = await Orders.submitOrder(built.payload);
      if (res && res.ok) {
        if (global.Basit.Recs) global.Basit.Recs.remember(built.payload.customer.phone, built.payload.customer.name);
        Cart.clear(); // تفريغ السلة بعد نجاح إنشاء الطلب فقط
        UI.updateBadges();
        window.location.href = "success.html";
      } else {
        const code = res && res.code;
        if (code === "DELIVERY_DISABLED" || code === "PICKUP_DISABLED" || code === "NO_FULFILLMENT" ||
            code === "ZONE_REQUIRED" || code === "ZONE_INVALID" || code === "MINIMUM_ORDER" ||
            code === "ORDERS_DISABLED" || code === "MAINTENANCE_MODE") {
          // تغيّرت إعدادات المتجر — نُحدّث الواجهة من السيرفر ونعرض رسالته
          try { if (Store) await Store.refresh(); } catch (e) { /* تجاهل */ }
          setupFulfillment();
          renderSummary();
          showFormError((res && res.error) || "تعذر إنشاء الطلب — تحقق من الإعدادات المتاحة.");
        } else if (code === "PRODUCT_UNAVAILABLE" || code === "INSUFFICIENT_STOCK" ||
                   code === "PRODUCT_NOT_FOUND" || code === "INVALID_PRICE") {
          showFormError((res && res.error) || "أحد المنتجات في طلبك لم يعد متوفرًا.");
          renderSummary();
          renderReview();
        } else if (code === "NETWORK_ERROR") {
          showFormError("تعذر الاتصال بالسيرفر — تأكد من تشغيل الـ Backend وحاول مرة أخرى.");
        } else if (res && res.error) {
          showFormError(res.error);
        } else {
          showFormError("حدث خطأ أثناء تأكيد الطلب. من فضلك حاول مرة أخرى.");
        }
        submitting = false;
        setLoading(false);
      }
    } catch (e) {
      showFormError("حدث خطأ أثناء تأكيد الطلب. من فضلك حاول مرة أخرى.");
      submitting = false;
      setLoading(false);
    }
  }

  /* ================= الربط ================= */

  function bind() {
    const form = $("#checkoutForm");
    if (form) {
      form.addEventListener("submit", (e) => { e.preventDefault(); onConfirm(); });
      // مراجعة حية أثناء الكتابة + مسح الخطأ عند التصحيح
      form.addEventListener("input", (e) => {
        if (e.target.matches("input, textarea")) clearFieldError(e.target);
        renderReview();
      });
      form.addEventListener("change", (e) => {
        if (e.target.name === "fulfill") {
          fulfillment = e.target.value === "pickup" ? "pickup" : "delivery";
          applyFulfillment();
          renderZoneInfo();
          renderSummary();
        }
        if (e.target.id === "coZone") {
          zoneId = e.target.value || "";
          clearFieldError(e.target);
          renderZoneInfo();
          renderSummary();
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-edit-cart]")) UI.openDrawer();
    });

    // أي تغيير في السلة (من الدرج) يحدّث الملخص والمراجعة فورًا
    document.addEventListener("basit:cart-changed", () => {
      if (!onPage() || submitting) return;
      renderSummary();
      renderReview();
      refreshQuote();
    });
  }

  /* ================= إعدادات المتجر (البوابات + المناطق) ================= */

  function fulfillCard(value, icon, title, sub, selected) {
    return '<label class="fulfill-card' + (selected ? " is-selected" : "") + '">' +
      '<input type="radio" name="fulfill" value="' + value + '"' + (selected ? " checked" : "") + " />" +
      '<span class="fc-icon" aria-hidden="true">' + icon + "</span>" +
      '<span class="fc-text"><strong>' + title + "</strong><small>" + sub + "</small></span>" +
      "</label>";
  }

  function setupFulfillment() {
    if (!Store) return;
    const st = Store.get();
    const zones = Store.zones();
    const noteBox = document.getElementById("coStoreNote");
    if (noteBox) {
      if (st.customerOrderNote) {
        noteBox.hidden = false;
        noteBox.innerHTML = "📌 " + UI.esc(st.customerOrderNote);
      } else {
        noteBox.hidden = true;
      }
    }
    const gate = document.getElementById("coGate");
    const confirmBtn = document.getElementById("confirmBtn");
    const blocked = !st.ordersEnabled || (!st.deliveryEnabled && !st.pickupEnabled);
    if (gate) {
      if (!st.ordersEnabled) {
        gate.hidden = false;
        gate.innerHTML = "⛔ الطلبات غير متاحة حاليًا، يمكنك تصفح المنتجات والعودة لاحقًا.";
      } else if (!st.deliveryEnabled && !st.pickupEnabled) {
        gate.hidden = false;
        gate.innerHTML = "⛔ المتجر لا يوفر طرق استلام متاحة حاليًا.";
      } else {
        gate.hidden = true;
      }
    }
    if (confirmBtn) confirmBtn.disabled = blocked;
    const grid = document.getElementById("fulfillGrid");
    if (grid) {
      if (!st.deliveryEnabled && !st.pickupEnabled) {
        grid.innerHTML = '<p class="fulfill-none">المتجر لا يوفر طرق استلام متاحة حاليًا.</p>';
      } else {
        if (fulfillment === "delivery" && !st.deliveryEnabled) fulfillment = "pickup";
        if (fulfillment === "pickup" && !st.pickupEnabled) fulfillment = "delivery";
        const zoneHint = zones.length ? zones.length + " مناطق متاحة" : "لا توجد مناطق مفعلة";
        grid.innerHTML =
          (st.deliveryEnabled ? fulfillCard("delivery", "🚚", "توصيل للمنزل", UI.esc(zoneHint), fulfillment === "delivery") : "") +
          (st.pickupEnabled ? fulfillCard("pickup", "🏪", "استلام من المحل", UI.esc(st.storeAddress || "من عنوان المحل."), fulfillment === "pickup") : "");
      }
    }
    renderZoneField();
    applyFulfillment();
  }

  function renderZoneField() {
    const sel = document.getElementById("coZone");
    const field = document.getElementById("zoneField");
    if (!sel || !field || !Store) return;
    const zones = Store.zones();
    if (!zoneId || !Store.zoneById(zoneId)) zoneId = zones.length === 1 ? zones[0].id : "";
    sel.innerHTML = '<option value="">— اختر المنطقة —</option>' +
      zones.map((z) => '<option value="' + UI.esc(z.id) + '"' + (z.id === zoneId ? " selected" : "") + ">" +
        UI.esc(z.name) + " — توصيل " + UI.fmtPrice(z.deliveryFee) + "</option>").join("");
    renderZoneInfo();
  }

  function renderZoneInfo() {
    const info = document.getElementById("coZoneInfo");
    if (!info || !Store) return;
    const z = Store.zoneById(zoneId);
    const st = Store.get();
    if (!z) { info.innerHTML = ""; return; }
    const parts = ["🚚 رسوم التوصيل: <b>" + UI.fmtPrice(z.deliveryFee) + "</b>"];
    const min = z.minimumOrderAmount > 0 ? z.minimumOrderAmount : st.minimumOrderAmount;
    if (min > 0) parts.push("الحد الأدنى: <b>" + UI.fmtPrice(min) + "</b>");
    if (z.estimatedMinutes > 0) parts.push("الوقت المتوقع: <b>" + z.estimatedMinutes + " دقيقة</b>");
    if (st.freeDeliveryThreshold > 0) parts.push("🎉 التوصيل مجاني فوق <b>" + UI.fmtPrice(st.freeDeliveryThreshold) + "</b>");
    info.innerHTML = parts.join(" • ");
  }

  async function init() {
    Cart = global.Basit.Cart;
    UI = global.Basit.UI;
    Orders = global.Basit.Orders;
    Store = global.Basit.Store || null;
    if (!onPage() || !Cart || !UI || !Orders) return;
    bind();
    if (Store) {
      try { await Store.ensure(); } catch (e) { /* الوضع المحلي */ }
      setupFulfillment();
    }
    prefillCustomer();
    applyFulfillment();
    renderSummary();
    renderReview();
    if (UI.renderCheckoutRecs) UI.renderCheckoutRecs();
  }

  /** تعبئة الاسم والهاتف من زيارة سابقة (على جهاز العميل فقط) */
  /** تعبئة بيانات العميل: الحساب المسجل أولًا، ثم الرقم المتذكَّر — قابلة للتعديل */
  async function prefillCustomer() {
    const fill = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;
    };
    try {
      const Auth = global.Basit.Auth;
      const me = Auth ? await Auth.ensure() : null;
      if (me) {
        fill("coName", me.name);
        fill("coPhone", me.phone);
        fill("coAddress", me.address);
        fill("coArea", me.area);
        fill("coLandmark", me.landmark);
        return;
      }
    } catch (e) { /* تجاهل */ }
    try {
      const Recs = global.Basit.Recs;
      const r = Recs ? Recs.getRemembered() : null;
      if (!r) return;
      fill("coName", r.name);
      fill("coPhone", r.phone);
    } catch (e) { /* تجاهل */ }
  }

  global.Basit = global.Basit || {};
  global.Basit.Checkout = { init };
})(window);
