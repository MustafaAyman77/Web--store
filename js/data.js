/* ==========================================================================
   أسواق البسيط — Data (بيانات تجريبية للعرض فقط)
   --------------------------------------------------------------------------
   📦 هذا هو المكان الوحيد للمنتجات والأقسام والعروض.
   لتحديث البيانات الحقيقية لاحقًا: عدّل المصفوفات أدناه فقط.
   مستقبلًا يمكن استبدال هذا الملف بالكامل بجلب البيانات من Backend/MySQL
   دون أي تغيير في باقي الكود (عبر Basit.Api.getProducts).
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------------- الأقسام ---------------- */
  const CATEGORIES = [
    { id: "beverages", name: "المشروبات",        icon: "🥤" },
    { id: "snacks",    name: "السناكس والحلويات", icon: "🍫" },
    { id: "dairy",     name: "الألبان",           icon: "🥛" },
    { id: "grocery",   name: "البقالة",           icon: "🛒" },
    { id: "cleaning",  name: "المنظفات",          icon: "🧹" },
    { id: "care",      name: "العناية الشخصية",   icon: "🧴" },
    { id: "frozen",    name: "المجمدات",          icon: "🧊" },
    { id: "home",      name: "مستلزمات المنزل",   icon: "🏠" },
  ];

  /* ---------------- المنتجات ----------------
     الحقول:
     - id: معرّف فريد | name: الاسم | desc: وصف قصير
     - price: السعر | oldPrice: السعر قبل الخصم (اختياري)
     - unit: الوحدة (اختياري) | category: معرّف القسم
     - icon: أيقونة العرض | tint: [لون1, لون2] لخلفية الصورة
     - badge: شارة مميزة {text, tone: "offer"|"hot"|"new"} (اختياري)
  ------------------------------------------------ */
  const PRODUCTS = [
    { id: "p01", name: "بيبسي 330 مل",        desc: "كانز بيبسي مثلجة ومنعشة",      price: 15, unit: "كانز",   category: "beverages", icon: "🥫", tint: ["#dbeafe", "#bfdbfe"], badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p02", name: "عصير مانجو 1 لتر",    desc: "عصير مانجو طبيعي فاخر",         price: 25, unit: "علبة",   category: "beverages", icon: "🧃", tint: ["#fef3c7", "#fde68a"] },
    { id: "p03", name: "مياه معدنية 600 مل",  desc: "مياه نقية من مصدر موثوق",       price: 10, unit: "زجاجة",  category: "beverages", icon: "💧", tint: ["#e0f2fe", "#bae6fd"] },
    { id: "p04", name: "شيبسي عائلي",         desc: "شيبسي مقرمش بطعم الملح",        price: 15, unit: "كيس",    category: "snacks",    icon: "🍟", tint: ["#fef9c3", "#fde047"], badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p05", name: "شوكولاتة بالحليب",    desc: "شوكولاتة غنية بطعم الحليب",     price: 20, oldPrice: 25, unit: "قطعة", category: "snacks", icon: "🍫", tint: ["#f5e6d3", "#e7c89f"], badge: { text: "خصم", tone: "offer" } },
    { id: "p06", name: "بسكويت بالتمر",       desc: "بسكويت هش محشو بالتمر",         price: 12, unit: "علبة",   category: "snacks",    icon: "🍪", tint: ["#ffedd5", "#fed7aa"] },
    { id: "p07", name: "لبن كامل الدسم 1 لتر", desc: "لبن طازج كامل الدسم",          price: 30, unit: "علبة",   category: "dairy",     icon: "🥛", tint: ["#f8fafc", "#e2e8f0"], badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p08", name: "جبنة بيضاء",          desc: "جبنة بيضاء فاخرة للفطار",       price: 45, unit: "علبة",   category: "dairy",     icon: "🧀", tint: ["#fefce8", "#fef08a"] },
    { id: "p09", name: "أرز أبيض 1 كجم",      desc: "أرز أبيض فاخر درجة أولى",       price: 35, unit: "كيس",    category: "grocery",   icon: "🍚", tint: ["#f1f5f9", "#e2e8f0"] },
    { id: "p10", name: "مكرونة 400 جم",       desc: "مكرونة قمح فاخر",               price: 18, unit: "كيس",    category: "grocery",   icon: "🍝", tint: ["#fff7ed", "#ffedd5"] },
    { id: "p11", name: "مسحوق غسيل 1 كجم",    desc: "نظافة قوية ورائحة منعشة",       price: 60, oldPrice: 70, unit: "كيس", category: "cleaning", icon: "🧼", tint: ["#ede9fe", "#ddd6fe"], badge: { text: "خصم", tone: "offer" } },
    { id: "p12", name: "شامبو 400 مل",        desc: "شامبو مغذٍ لكل أنواع الشعر",     price: 85, unit: "عبوة",   category: "care",      icon: "🧴", tint: ["#fce7f3", "#fbcfe8"] },
    { id: "p13", name: "خضار مشكل مجمد 1 كجم", desc: "خضار طازج محفوظ بالتجميد",     price: 40, unit: "كيس",    category: "frozen",    icon: "🥦", tint: ["#ecfeff", "#cffafe"], badge: { text: "جديد", tone: "new" } },
    { id: "p14", name: "مناديل مطبخ",         desc: "مناديل قوية وعالية الامتصاص",   price: 28, unit: "لفة",    category: "home",      icon: "🧻", tint: ["#f8fafc", "#e2e8f0"] },
  ];

  /* ---------------- العروض ---------------- */
  const OFFERS = [
    {
      id: "o01", name: "🧺 عرض العيلة", sub: "سهرة البيت الكاملة",
      items: ["بيبسي × 2", "شيبسي عائلي", "شوكولاتة × 2"],
      oldPrice: 100, newPrice: 85, icon: "🧺",
    },
    {
      id: "o02", name: "🥛 عرض الفطار", sub: "ابدأ يومك صح",
      items: ["لبن 1 لتر", "جبنة بيضاء", "بسكويت بالتمر"],
      oldPrice: 87, newPrice: 75, icon: "🥛",
    },
    {
      id: "o03", name: "🧹 عرض النظافة", sub: "بيت نضيف بأقل سعر",
      items: ["مسحوق غسيل 1 كجم", "مناديل مطبخ"],
      oldPrice: 88, newPrice: 78, icon: "🧹",
    },
  ];

  /* ---------------- دوال مساعدة للوصول للبيانات ---------------- */
  const BasitData = {
    categories: CATEGORIES,
    products: PRODUCTS,
    offers: OFFERS,

    getCategory(id) {
      return CATEGORIES.find((c) => c.id === id) || null;
    },
    getProduct(id) {
      return PRODUCTS.find((p) => p.id === id) || null;
    },
    getOffer(id) {
      return OFFERS.find((o) => o.id === id) || null;
    },
    productsByCategory(catId) {
      if (!catId || catId === "all") return [...PRODUCTS];
      return PRODUCTS.filter((p) => p.category === catId);
    },
    countByCategory(catId) {
      return PRODUCTS.filter((p) => p.category === catId).length;
    },
    /** نسبة الخصم % محسوبة تلقائيًا */
    discountPercent(oldPrice, newPrice) {
      if (!oldPrice || oldPrice <= newPrice) return 0;
      return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    },
  };

  global.BasitData = BasitData;
})(window);
