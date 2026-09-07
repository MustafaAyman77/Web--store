// ==========================================================================
// أسواق البسيط — Seed Data (بيانات تجريبية للعرض فقط)
// نفس منتجات الواجهة (frontend/js/data.js) — تُزرع في SQLite عبر npm run seed.
// ⚠️ ليست أسعارًا أو منتجات حقيقية للمحل — Demo Data قابلة للاستبدال.
// ==========================================================================

export const SEED_PRODUCTS = [
  { id: "p01", name: "بيبسي 330 مل", desc: "كانز بيبسي مثلجة ومنعشة", price: 15, unit: "كانز", category: "beverages", icon: "🥫", tint: ["#dbeafe", "#bfdbfe"], available: 1, featured: 1, popularity: 98, badge: "الأكثر طلبًا|hot" },
  { id: "p02", name: "عصير مانجو 1 لتر", desc: "عصير مانجو طبيعي فاخر", price: 25, unit: "علبة", category: "beverages", icon: "🧃", tint: ["#fef3c7", "#fde68a"], available: 1, featured: 1, popularity: 82, badge: "" },
  { id: "p03", name: "مياه معدنية 600 مل", desc: "مياه نقية من مصدر موثوق", price: 10, unit: "زجاجة", category: "beverages", icon: "💧", tint: ["#e0f2fe", "#bae6fd"], available: 1, featured: 0, popularity: 90, badge: "" },
  { id: "p04", name: "شيبسي عائلي", desc: "شيبسي مقرمش بطعم الملح", price: 15, unit: "كيس", category: "snacks", icon: "🍟", tint: ["#fef9c3", "#fde047"], available: 1, featured: 1, popularity: 95, badge: "الأكثر طلبًا|hot" },
  { id: "p05", name: "شوكولاتة بالحليب", desc: "شوكولاتة غنية بطعم الحليب", price: 20, oldPrice: 25, unit: "قطعة", category: "snacks", icon: "🍫", tint: ["#f5e6d3", "#e7c89f"], available: 1, featured: 1, popularity: 88, badge: "خصم|offer" },
  { id: "p06", name: "بسكويت بالتمر", desc: "بسكويت هش محشو بالتمر", price: 12, unit: "علبة", category: "snacks", icon: "🍪", tint: ["#ffedd5", "#fed7aa"], available: 1, featured: 0, popularity: 70, badge: "" },
  { id: "p07", name: "لبن كامل الدسم 1 لتر", desc: "لبن طازج كامل الدسم", price: 30, unit: "علبة", category: "dairy", icon: "🥛", tint: ["#f8fafc", "#e2e8f0"], available: 1, featured: 1, popularity: 93, badge: "الأكثر طلبًا|hot" },
  { id: "p08", name: "جبنة بيضاء", desc: "جبنة بيضاء فاخرة للفطار", price: 45, unit: "علبة", category: "dairy", icon: "🧀", tint: ["#fefce8", "#fef08a"], available: 1, featured: 1, popularity: 80, badge: "" },
  { id: "p09", name: "أرز أبيض 1 كجم", desc: "أرز أبيض فاخر درجة أولى", price: 35, unit: "كيس", category: "grocery", icon: "🍚", tint: ["#f1f5f9", "#e2e8f0"], available: 1, featured: 1, popularity: 85, badge: "" },
  { id: "p10", name: "مكرونة 400 جم", desc: "مكرونة قمح فاخر", price: 18, unit: "كيس", category: "grocery", icon: "🍝", tint: ["#fff7ed", "#ffedd5"], available: 1, featured: 0, popularity: 76, badge: "" },
  { id: "p11", name: "مسحوق غسيل 1 كجم", desc: "نظافة قوية ورائحة منعشة", price: 60, oldPrice: 70, unit: "كيس", category: "cleaning", icon: "🧼", tint: ["#ede9fe", "#ddd6fe"], available: 1, featured: 1, popularity: 84, badge: "خصم|offer" },
  { id: "p12", name: "شامبو 400 مل", desc: "شامبو مغذٍ لكل أنواع الشعر", price: 85, unit: "عبوة", category: "care", icon: "🧴", tint: ["#fce7f3", "#fbcfe8"], available: 1, featured: 1, popularity: 72, badge: "" },
  { id: "p13", name: "خضار مشكل مجمد 1 كجم", desc: "خضار طازج محفوظ بالتجميد", price: 40, unit: "كيس", category: "frozen", icon: "🥦", tint: ["#ecfeff", "#cffafe"], available: 1, featured: 1, popularity: 65, badge: "جديد|new" },
  { id: "p14", name: "مناديل مطبخ", desc: "مناديل قوية وعالية الامتصاص", price: 28, unit: "لفة", category: "home", icon: "🧻", tint: ["#f8fafc", "#e2e8f0"], available: 1, featured: 1, popularity: 68, badge: "" },
  { id: "p15", name: "سبرايت 330 مل", desc: "كانز سبرايت بطعم الليمون", price: 15, unit: "كانز", category: "beverages", icon: "🥫", tint: ["#dcfce7", "#bbf7d0"], available: 1, featured: 0, popularity: 86, badge: "" },
  { id: "p16", name: "عصير برتقال 1 لتر", desc: "عصير برتقال طبيعي 100%", price: 28, unit: "علبة", category: "beverages", icon: "🧃", tint: ["#ffedd5", "#fdba74"], available: 1, featured: 0, popularity: 78, badge: "" },
  { id: "p17", name: "زبادي طبيعي 170 جم", desc: "زبادي كريمي غني بالكالسيوم", price: 12, unit: "علبة", category: "dairy", icon: "🍶", tint: ["#f8fafc", "#e0f2fe"], available: 1, featured: 0, popularity: 74, badge: "" },
  { id: "p18", name: "جبنة شيدر 250 جم", desc: "جبنة شيدر مبشورة جاهزة", price: 55, unit: "علبة", category: "dairy", icon: "🧀", tint: ["#fef3c7", "#fcd34d"], available: 1, featured: 0, popularity: 62, badge: "" },
  { id: "p19", name: "سكر أبيض 1 كجم", desc: "سكر أبيض نقي فاخر", price: 32, unit: "كيس", category: "grocery", icon: "🍬", tint: ["#f8fafc", "#f1f5f9"], available: 1, featured: 0, popularity: 81, badge: "" },
  { id: "p20", name: "زيت طعام 1 لتر", desc: "زيت نباتي نقي للقلي والطبخ", price: 75, oldPrice: 85, unit: "زجاجة", category: "grocery", icon: "🫗", tint: ["#fefce8", "#fde68a"], available: 1, featured: 1, popularity: 89, badge: "خصم|offer" },
  { id: "p21", name: "شاي أسود 250 جم", desc: "شاي خرز فاخر سريع الذوبان", price: 48, unit: "علبة", category: "grocery", icon: "🍵", tint: ["#ffedd5", "#fed7aa"], available: 1, featured: 0, popularity: 83, badge: "" },
  { id: "p22", name: "كيك بالشوكولاتة", desc: "كيك إسفنجي بطبقة شوكولاتة", price: 18, unit: "قطعة", category: "snacks", icon: "🍰", tint: ["#fce7f3", "#f9a8d4"], available: 0, featured: 0, popularity: 60, badge: "" },
  { id: "p23", name: "لبان بالنعناع", desc: "لبان منعش بنكهة النعناع", price: 8, unit: "علبة", category: "snacks", icon: "🍭", tint: ["#ecfdf5", "#a7f3d0"], available: 1, featured: 0, popularity: 55, badge: "" },
  { id: "p24", name: "سائل غسيل أطباق 750 مل", desc: "قوة مضاعفة على الدهون", price: 42, unit: "عبوة", category: "cleaning", icon: "🧽", tint: ["#fef9c3", "#fde047"], available: 1, featured: 0, popularity: 71, badge: "" },
  { id: "p25", name: "مطهر أرضيات 1 لتر", desc: "تعقيم ورائحة تدوم طويلًا", price: 55, unit: "عبوة", category: "cleaning", icon: "🪣", tint: ["#e0f2fe", "#7dd3fc"], available: 1, featured: 0, popularity: 64, badge: "" },
  { id: "p26", name: "صابون طبيعي", desc: "صابون لطيف بزيت الزيتون", price: 22, unit: "قطعة", category: "care", icon: "🫧", tint: ["#f0fdfa", "#99f6e4"], available: 1, featured: 0, popularity: 58, badge: "" },
  { id: "p27", name: "معجون أسنان 120 جم", desc: "حماية من التسوس وانتعاش", price: 38, unit: "عبوة", category: "care", icon: "🪥", tint: ["#eff6ff", "#bfdbfe"], available: 1, featured: 0, popularity: 66, badge: "" },
  { id: "p28", name: "آيس كريم فانيليا 1 لتر", desc: "آيس كريم غني بطعم الفانيليا", price: 65, unit: "علبة", category: "frozen", icon: "🍨", tint: ["#fdf4ff", "#f5d0fe"], available: 0, featured: 0, popularity: 77, badge: "" },
  { id: "p29", name: "بطاطس مقلية مجمدة 1 كجم", desc: "أصابع بطاطس جاهزة للقلي", price: 48, unit: "كيس", category: "frozen", icon: "🥔", tint: ["#fefce8", "#fde047"], available: 1, featured: 0, popularity: 73, badge: "" },
  { id: "p30", name: "أكياس قمامة 10 قطع", desc: "أكياس قوية بسعة كبيرة", price: 25, unit: "لفة", category: "home", icon: "🗑️", tint: ["#f1f5f9", "#cbd5e1"], available: 1, featured: 0, popularity: 52, badge: "" },
  { id: "p31", name: "إسفنج مطبخ 3 قطع", desc: "إسفنج عالي الجودة يدوم أكثر", price: 20, unit: "كيس", category: "home", icon: "🧺", tint: ["#fff7ed", "#fdba74"], available: 1, featured: 0, popularity: 48, badge: "" },
  { id: "p32", name: "قهوة سريعة 200 جم", desc: "قهوة سريعة التحضير غنية", price: 95, oldPrice: 110, unit: "برطمان", category: "beverages", icon: "☕", tint: ["#f5e6d3", "#d6a86f"], available: 1, featured: 1, popularity: 87, badge: "خصم|offer" },
  // العروض المجمعة كأصناف قابلة للطلب بنفس IDs الواجهة
  { id: "o01", name: "🧺 عرض العيلة", desc: "بيبسي × 2 + شيبسي عائلي + شوكولاتة × 2", price: 85, oldPrice: 100, unit: "عرض", category: "offers", icon: "🧺", tint: ["#ffedd5", "#fdba74"], available: 1, featured: 0, popularity: 91, badge: "خصم|offer" },
  { id: "o02", name: "🥛 عرض الفطار", desc: "لبن 1 لتر + جبنة بيضاء + بسكويت بالتمر", price: 75, oldPrice: 87, unit: "عرض", category: "offers", icon: "🥛", tint: ["#ffedd5", "#fdba74"], available: 1, featured: 0, popularity: 84, badge: "خصم|offer" },
  { id: "o03", name: "🧹 عرض النظافة", desc: "مسحوق غسيل 1 كجم + مناديل مطبخ", price: 78, oldPrice: 88, unit: "عرض", category: "offers", icon: "🧹", tint: ["#ffedd5", "#fdba74"], available: 1, featured: 0, popularity: 79, badge: "خصم|offer" },
];
