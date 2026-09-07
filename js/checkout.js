/* ==========================================================================
   أسواق البسيط — Checkout (صفحة إتمام الطلب checkout.html فقط)
   ملخص حي من السلة + نموذج بيانات + توصيل/استلام + مراجعة + تأكيد.
   يعتمد على: Basit.Cart (السلة) + Basit.Orders (بناء الطلب وإرساله Demo).
   ========================================================================== */
(function (global) {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);

  let Cart, UI, Orders;
  let fulfillment = "delivery";
  let submitting = false;

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
      '<div class="total-row"><span>🚚 التوصيل</span><output class="pending">سيتم تحديده لاحقًا</output></div>' +
      '<div class="total-row grand"><span>الإجمالي</span><output>' + UI.fmtPrice(Cart.total()) + "</output></div>" +
      '<button type="button" class="btn btn-outline btn-block" data-edit-cart>🛠️ تعديل السلة</button>';
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
      (fulfillment === "delivery"
        ? '<div class="review-row"><span class="rk">📍 العنوان</span>' + cell(addr) + "</div>"
        : "") +
      '<div class="review-row"><span class="rk">🛍️ المنتجات</span><span class="rv">' +
        Cart.count() + " قطعة</span></div>" +
      '<div class="review-row"><span class="rk">💰 الإجمالي</span><span class="rv is-total">' +
        UI.fmtPrice(Cart.total()) + "</span></div>" +
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
        Cart.clear(); // تفريغ السلة بعد نجاح إنشاء الطلب فقط
        UI.updateBadges();
        window.location.href = "success.html";
      } else {
        showFormError("حدث خطأ أثناء تأكيد الطلب. من فضلك حاول مرة أخرى.");
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
    });
  }

  function init() {
    Cart = global.Basit.Cart;
    UI = global.Basit.UI;
    Orders = global.Basit.Orders;
    if (!onPage() || !Cart || !UI || !Orders) return;
    bind();
    applyFulfillment();
    renderSummary();
    renderReview();
  }

  global.Basit = global.Basit || {};
  global.Basit.Checkout = { init };
})(window);
