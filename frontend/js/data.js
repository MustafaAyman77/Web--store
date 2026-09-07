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

  /* ---------------- المنتجات (تجريبية — 32 منتج) ----------------
     الحقول:
     - id: معرّف فريد | name: الاسم | desc: وصف قصير
     - price: السعر | oldPrice: السعر قبل الخصم (اختياري)
     - unit: الوحدة | category: معرّف القسم
     - icon: أيقونة العرض | tint: [لون1, لون2] لخلفية الصورة
     - badge: {text, tone: "offer"|"hot"|"new"} (اختياري)
     - available: التوفر (true/false) | featured: يظهر في الرئيسية
     - popularity: شعبية 1-100 (للترتيب) | added: تسلسل الإضافة (الأحدث)
  ---------------------------------------------------------------- */
  const PRODUCTS = [
    { id: "p01", name: "بيبسي 330 مل",         desc: "كانز بيبسي مثلجة ومنعشة",       price: 15, unit: "كانز",  category: "beverages", icon: "🥫", tint: ["#dbeafe", "#bfdbfe"], available: true, featured: true,  popularity: 98, added: 1,  badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p02", name: "عصير مانجو 1 لتر",     desc: "عصير مانجو طبيعي فاخر",          price: 25, unit: "علبة",  category: "beverages", icon: "🧃", tint: ["#fef3c7", "#fde68a"], available: true, featured: true,  popularity: 82, added: 2 },
    { id: "p03", name: "مياه معدنية 600 مل",   desc: "مياه نقية من مصدر موثوق",        price: 10, unit: "زجاجة", category: "beverages", icon: "💧", tint: ["#e0f2fe", "#bae6fd"], available: true, featured: false, popularity: 90, added: 3 },
    { id: "p04", name: "شيبسي عائلي",          desc: "شيبسي مقرمش بطعم الملح",         price: 15, unit: "كيس",   category: "snacks",    icon: "🍟", tint: ["#fef9c3", "#fde047"], available: true, featured: true,  popularity: 95, added: 4,  badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p05", name: "شوكولاتة بالحليب",     desc: "شوكولاتة غنية بطعم الحليب",      price: 20, oldPrice: 25, unit: "قطعة", category: "snacks", icon: "🍫", tint: ["#f5e6d3", "#e7c89f"], available: true, featured: true, popularity: 88, added: 5, badge: { text: "خصم", tone: "offer" } },
    { id: "p06", name: "بسكويت بالتمر",        desc: "بسكويت هش محشو بالتمر",          price: 12, unit: "علبة",  category: "snacks",    icon: "🍪", tint: ["#ffedd5", "#fed7aa"], available: true, featured: false, popularity: 70, added: 6 },
    { id: "p07", name: "لبن كامل الدسم 1 لتر", desc: "لبن طازج كامل الدسم",           price: 30, unit: "علبة",  category: "dairy",     icon: "🥛", tint: ["#f8fafc", "#e2e8f0"], available: true, featured: true,  popularity: 93, added: 7,  badge: { text: "الأكثر طلبًا", tone: "hot" } },
    { id: "p08", name: "جبنة بيضاء",           desc: "جبنة بيضاء فاخرة للفطار",        price: 45, unit: "علبة",  category: "dairy",     icon: "🧀", tint: ["#fefce8", "#fef08a"], available: true, featured: true,  popularity: 80, added: 8 },
    { id: "p09", name: "أرز أبيض 1 كجم",       desc: "أرز أبيض فاخر درجة أولى",        price: 35, unit: "كيس",   category: "grocery",   icon: "🍚", tint: ["#f1f5f9", "#e2e8f0"], available: true, featured: true,  popularity: 85, added: 9 },
    { id: "p10", name: "مكرونة 400 جم",        desc: "مكرونة قمح فاخر",                price: 18, unit: "كيس",   category: "grocery",   icon: "🍝", tint: ["#fff7ed", "#ffedd5"], available: true, featured: false, popularity: 76, added: 10 },
    { id: "p11", name: "مسحوق غسيل 1 كجم",     desc: "نظافة قوية ورائحة منعشة",        price: 60, oldPrice: 70, unit: "كيس", category: "cleaning", icon: "🧼", tint: ["#ede9fe", "#ddd6fe"], available: true, featured: true, popularity: 84, added: 11, badge: { text: "خصم", tone: "offer" } },
    { id: "p12", name: "شامبو 400 مل",         desc: "شامبو مغذٍ لكل أنواع الشعر",      price: 85, unit: "عبوة",  category: "care",      icon: "🧴", tint: ["#fce7f3", "#fbcfe8"], available: true, featured: true,  popularity: 72, added: 12 },
    { id: "p13", name: "خضار مشكل مجمد 1 كجم", desc: "خضار طازج محفوظ بالتجميد",       price: 40, unit: "كيس",   category: "frozen",    icon: "🥦", tint: ["#ecfeff", "#cffafe"], available: true, featured: true, popularity: 65, added: 13, badge: { text: "جديد", tone: "new" } },
    { id: "p14", name: "مناديل مطبخ",          desc: "مناديل قوية وعالية الامتصاص",    price: 28, unit: "لفة",   category: "home",      icon: "🧻", tint: ["#f8fafc", "#e2e8f0"], available: true, featured: true,  popularity: 68, added: 14 },
    { id: "p15", name: "سبرايت 330 مل",        desc: "كانز سبرايت بطعم الليمون",       price: 15, unit: "كانز",  category: "beverages", icon: "🥫", tint: ["#dcfce7", "#bbf7d0"], available: true, featured: false, popularity: 86, added: 15 },
    { id: "p16", name: "عصير برتقال 1 لتر",    desc: "عصير برتقال طبيعي 100%",         price: 28, unit: "علبة",  category: "beverages", icon: "🧃", tint: ["#ffedd5", "#fdba74"], available: true, featured: false, popularity: 78, added: 16 },
    { id: "p17", name: "زبادي طبيعي 170 جم",   desc: "زبادي كريمي غني بالكالسيوم",     price: 12, unit: "علبة",  category: "dairy",     icon: "🍶", tint: ["#f8fafc", "#e0f2fe"], available: true, featured: false, popularity: 74, added: 17 },
    { id: "p18", name: "جبنة شيدر 250 جم",     desc: "جبنة شيدر مبشورة جاهزة",         price: 55, unit: "علبة",  category: "dairy",     icon: "🧀", tint: ["#fef3c7", "#fcd34d"], available: true, featured: false, popularity: 62, added: 18 },
    { id: "p19", name: "سكر أبيض 1 كجم",       desc: "سكر أبيض نقي فاخر",              price: 32, unit: "كيس",   category: "grocery",   icon: "🍬", tint: ["#f8fafc", "#f1f5f9"], available: true, featured: false, popularity: 81, added: 19 },
    { id: "p20", name: "زيت طعام 1 لتر",       desc: "زيت نباتي نقي للقلي والطبخ",     price: 75, oldPrice: 85, unit: "زجاجة", category: "grocery", icon: "🫗", tint: ["#fefce8", "#fde68a"], available: true, featured: true, popularity: 89, added: 20, badge: { text: "خصم", tone: "offer" } },
    { id: "p21", name: "شاي أسود 250 جم",      desc: "شاي خرز فاخر سريع الذوبان",      price: 48, unit: "علبة",  category: "grocery",   icon: "🍵", tint: ["#ffedd5", "#fed7aa"], available: true, featured: false, popularity: 83, added: 21 },
    { id: "p22", name: "كيك بالشوكولاتة",      desc: "كيك إسفنجي بطبقة شوكولاتة",      price: 18, unit: "قطعة",  category: "snacks",    icon: "🍰", tint: ["#fce7f3", "#f9a8d4"], available: false, featured: false, popularity: 60, added: 22 },
    { id: "p23", name: "لبان بالنعناع",        desc: "لبان منعش بنكهة النعناع",        price: 8,  unit: "علبة",  category: "snacks",    icon: "🍭", tint: ["#ecfdf5", "#a7f3d0"], available: true, featured: false, popularity: 55, added: 23 },
    { id: "p24", name: "سائل غسيل أطباق 750 مل", desc: "قوة مضاعفة على الدهون",        price: 42, unit: "عبوة",  category: "cleaning",  icon: "🧽", tint: ["#fef9c3", "#fde047"], available: true, featured: false, popularity: 71, added: 24 },
    { id: "p25", name: "مطهر أرضيات 1 لتر",    desc: "تعقيم ورائحة تدوم طويلًا",       price: 55, unit: "عبوة",  category: "cleaning",  icon: "🪣", tint: ["#e0f2fe", "#7dd3fc"], available: true, featured: false, popularity: 64, added: 25 },
    { id: "p26", name: "صابون طبيعي",          desc: "صابون لطيف بزيت الزيتون",        price: 22, unit: "قطعة",  category: "care",      icon: "🫧", tint: ["#f0fdfa", "#99f6e4"], available: true, featured: false, popularity: 58, added: 26 },
    { id: "p27", name: "معجون أسنان 120 جم",   desc: "حماية من التسوس وانتعاش",        price: 38, unit: "عبوة",  category: "care",      icon: "🪥", tint: ["#eff6ff", "#bfdbfe"], available: true, featured: false, popularity: 66, added: 27 },
    { id: "p28", name: "آيس كريم فانيليا 1 لتر", desc: "آيس كريم غني بطعم الفانيليا",  price: 65, unit: "علبة",  category: "frozen",    icon: "🍨", tint: ["#fdf4ff", "#f5d0fe"], available: false, featured: false, popularity: 77, added: 28 },
    { id: "p29", name: "بطاطس مقلية مجمدة 1 كجم", desc: "أصابع بطاطس جاهزة للقلي",     price: 48, unit: "كيس",   category: "frozen",    icon: "🥔", tint: ["#fefce8", "#fde047"], available: true, featured: false, popularity: 73, added: 29 },
    { id: "p30", name: "أكياس قمامة 10 قطع",   desc: "أكياس قوية بسعة كبيرة",          price: 25, unit: "لفة",   category: "home",      icon: "🗑️", tint: ["#f1f5f9", "#cbd5e1"], available: true, featured: false, popularity: 52, added: 30 },
    { id: "p31", name: "إسفنج مطبخ 3 قطع",     desc: "إسفنج عالي الجودة يدوم أكثر",    price: 20, unit: "كيس",   category: "home",      icon: "🧺", tint: ["#fff7ed", "#fdba74"], available: true, featured: false, popularity: 48, added: 31 },
    { id: "p32", name: "قهوة سريعة 200 جم",    desc: "قهوة سريعة التحضير غنية",        price: 95, oldPrice: 110, unit: "برطمان", category: "beverages", icon: "☕", tint: ["#f5e6d3", "#d6a86f"], available: true, featured: true, popularity: 87, added: 32, badge: { text: "خصم", tone: "offer" } },
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

  /* ---------------- تطبيع النص العربي للبحث ---------------- */
  function normalizeAr(str) {
    return String(str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/[\u064B-\u0652\u0640]/g, "") // التشكيل والتطويل
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasDiscount(p) {
    return !!(p && p.oldPrice && Number(p.oldPrice) > Number(p.price)) ||
      !!(p && p.badge && p.badge.tone === "offer");
  }

  /* ---------------- دوال الوصول للبيانات ---------------- */
  const BasitData = {
    categories: CATEGORIES,
    products: PRODUCTS,
    offers: OFFERS,
    normalizeAr,
    hasDiscount,

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
    /** منتجات الرئيسية المميزة فقط */
    featuredByCategory(catId) {
      const list = PRODUCTS.filter((p) => p.featured);
      if (!catId || catId === "all") return list;
      return list.filter((p) => p.category === catId);
    },
    countByCategory(catId) {
      return PRODUCTS.filter((p) => p.category === catId).length;
    },
    /** منتجات مقترحة: نفس القسم أولًا ثم المميزة — بعدد n */
    relatedProducts(id, n) {
      const current = this.getProduct(id);
      if (!current) return [];
      const sameCat = PRODUCTS.filter((p) => p.id !== id && p.category === current.category);
      const fill = PRODUCTS.filter((p) => p.id !== id && p.category !== current.category && p.featured);
      const rest = PRODUCTS.filter((p) => p.id !== id && p.category !== current.category && !p.featured);
      return sameCat.concat(fill, rest).slice(0, n || 4);
    },
    /** هل المنتج يطابق كلمة البحث؟ */
    matchesQuery(product, query) {
      const q = normalizeAr(query);
      if (!q) return true;
      const cat = this.getCategory(product.category);
      const hay = normalizeAr(
        [product.name, product.desc, product.unit, cat ? cat.name : ""].join(" ")
      );
      return q.split(" ").every((word) => word && hay.indexOf(word) !== -1);
    },
    /** ترتيب قائمة المنتجات حسب المفتاح */
    sortProducts(list, sortKey) {
      const arr = [...list];
      switch (sortKey) {
        case "price-asc":  return arr.sort((a, b) => a.price - b.price);
        case "price-desc": return arr.sort((a, b) => b.price - a.price);
        case "newest":     return arr.sort((a, b) => (b.added || 0) - (a.added || 0));
        case "offers":
          return arr.sort((a, b) =>
            (hasDiscount(b) - hasDiscount(a)) || ((b.popularity || 0) - (a.popularity || 0)));
        case "popular":
        default:
          return arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      }
    },
    /** نسبة الخصم % محسوبة تلقائيًا */
    discountPercent(oldPrice, newPrice) {
      if (!oldPrice || oldPrice <= newPrice) return 0;
      return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    },
    /**
     * استبدال البيانات المحلية ببيانات الـ Backend (تُستدعى مرة عند الإقلاع).
     * تُعدَّل المصفوفات في مكانها حتى تبقى كل المراجع سليمة.
     */
    _replaceAll(data) {
      if (data && Array.isArray(data.products) && data.products.length) {
        PRODUCTS.length = 0;
        data.products.forEach((p) => { if (p && p.id) PRODUCTS.push(p); });
      }
      if (data && Array.isArray(data.categories) && data.categories.length) {
        CATEGORIES.length = 0;
        data.categories.forEach((c) => { if (c && c.id) CATEGORIES.push(c); });
      }
    },
  };

  global.BasitData = BasitData;
})(window);
