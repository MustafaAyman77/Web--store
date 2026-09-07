/* ==========================================================================
   أسواق البسيط — Config
   الإعدادات العامة للمحل في مكان واحد.
   ⚠️ قاعدة مهمة: لا توضع هنا أي بيانات حساسة (Tokens / مفاتيح) إطلاقًا.
   ========================================================================== */
(function (global) {
  "use strict";

  const BasitConfig = {
    store: {
      name: "أسواق البسيط",
      tagline: "كل احتياجاتك... في مكان واحد",
      address: "شارع الحجاز، مدينة مغاغة، محافظة المنيا، مصر",
      shortAddress: "شارع الحجاز — مغاغة",
      hours: "مفتوح 24 ساعة طوال أيام الأسبوع",
      currency: "ج.م",
    },

    // بيانات التواصل — تُستكمل لاحقًا من صاحب المحل (تُترك null حتى تتوفر)
    contact: {
      phone: null,      // مثال لاحقًا: "01xxxxxxxxx"
      whatsapp: null,   // مثال لاحقًا: "201xxxxxxxxx"
      facebook: null,   // مثال لاحقًا: "https://facebook.com/..."
      instagram: null,  // مثال لاحقًا: "https://instagram.com/..."
    },

    // إعدادات السلة
    cart: {
      storageKey: "basit_cart_v1",
      maxQtyPerItem: 20,
    },

    // طبقة إرسال الطلبات
    // mode: "auto" (افتراضي) = استخدام السيرفر عند توفره وإلا وضع Demo محلي.
    // baseUrl فارغ = نفس الـ Origin (السيرفر يقدّم الواجهة من نفس البورت).
    api: {
      mode: "auto", // "auto" | "demo" | "backend"
      baseUrl: "",
      timeoutMs: 12000,
    },
  };

  // تجميد الإعدادات لمنع تعديلها بالخطأ من أي مكان آخر
  global.BasitConfig = Object.freeze(BasitConfig);
})(window);
