/* ==========================================================================
   أسواق البسيط — Login (صفحة تسجيل الدخول login.html فقط)
   هاتف → رمز تحقق → دخول. بدون كلمة سر. الضيف يطلب عادي بدون دخول.
   ========================================================================== */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let timer = null;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  function alert(msg, ok) {
    const box = $("loginAlert");
    if (!box) return;
    if (!msg) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = msg;
    box.classList.toggle("is-ok", !!ok);
  }

  async function post(path, body) {
    const res = await fetch(base() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error((data.error && data.error.message) || "حدث خطأ — حاول مرة أخرى.");
    }
    return data.data || {};
  }

  function startCountdown(sec) {
    const btn = $("loginResend");
    const echo = $("loginCountdown");
    clearInterval(timer);
    let left = Math.max(1, Number(sec) || 60);
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        echo.textContent = "";
        return;
      }
      echo.textContent = " (إعادة الإرسال بعد " + left + " ثانية)";
      left -= 1;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function showOtpStep(phone, cooldown) {
    $("loginPhoneForm").hidden = true;
    $("loginOtpForm").hidden = false;
    $("loginPhoneEcho").textContent = phone;
    $("loginOtp").value = "";
    startCountdown(cooldown);
    $("loginOtp").focus();
  }

  function init() {
    if (!$("loginPhoneForm")) return;
    const Auth = global.Basit.Auth;
    const Recs = global.Basit.Recs;
    const qs = new URLSearchParams(location.search);
    const next = qs.get("next") || "account.html";

    // لو داخل بالفعل → روح لوجهتك
    Auth.ensure().then((me) => {
      if (me) location.href = next;
    });

    // تعبئة من الدعوة (صفحة النجاح) أو من رقم متذكَّر
    const remembered = Recs ? Recs.getRemembered() : null;
    if (qs.get("phone")) $("loginPhone").value = qs.get("phone");
    else if (remembered) $("loginPhone").value = remembered.phone;
    if (qs.get("name")) $("loginName").value = qs.get("name");
    else if (remembered && remembered.name) $("loginName").value = remembered.name;

    $("loginPhoneForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      alert("");
      const phone = $("loginPhone").value.trim();
      if (!/^01[0-9]{9}$/.test(phone)) {
        alert("من فضلك أدخل رقم هاتف مصري صحيح (11 رقمًا يبدأ بـ 01).");
        return;
      }
      const btn = $("loginSendBtn");
      btn.disabled = true;
      try {
        const data = await post("/api/auth/send-otp", { phone });
        showOtpStep(data.phone || phone, data.cooldownSeconds);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $("loginOtpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      alert("");
      const code = $("loginOtp").value.replace(/[^0-9]/g, "");
      if (code.length < 4) {
        alert("من فضلك أدخل رمز التحقق المكوَّن من 6 أرقام.");
        return;
      }
      const btn = $("loginVerifyBtn");
      btn.disabled = true;
      try {
        await post("/api/auth/verify-otp", {
          phone: $("loginPhone").value.trim(),
          code,
          name: $("loginName").value.trim(),
        });
        if (Recs) Recs.remember($("loginPhone").value.trim(), $("loginName").value.trim());
        await Auth.refresh();
        alert("تم تسجيل الدخول بنجاح ✅", true);
        location.href = next;
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $("loginChangePhone").addEventListener("click", () => {
      clearInterval(timer);
      $("loginOtpForm").hidden = true;
      $("loginPhoneForm").hidden = false;
      alert("");
      $("loginPhone").focus();
    });

    $("loginResend").addEventListener("click", async () => {
      alert("");
      try {
        const data = await post("/api/auth/send-otp", { phone: $("loginPhone").value.trim() });
        startCountdown(data.cooldownSeconds);
        alert("تم إرسال رمز جديد ✅", true);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  global.Basit = global.Basit || {};
  global.Basit.Login = { init };
})(window);
