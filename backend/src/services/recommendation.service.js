// ==========================================================================
// أسواق البسيط — Recommendation Engine (قواعد + بيانات الـDB — بدون AI خارجي)
// --------------------------------------------------------------------------
// الأولوية: متكرر الشراء > مرتبط بالسلة > جديد في قسم مفضل > عرض في قسم
// مفضل > مشابه > الأكثر طلبًا. كل الأوزان هنا فقط — الواجهة تعرض فقط.
// الخصوصية: الاستجابة منتجات فقط — لا عناوين ولا هواتف ولا سجل طلبات.
// ==========================================================================
import { getDb } from "../database/database.js";
import { env } from "../config/env.js";
import { toPublicProduct } from "../controllers/products.controller.js";
import { isPurchasable, isNewProduct } from "../utils/product-status.js";
import { findCustomerByPhone } from "./customer.service.js";
import { getPurchaseHistory } from "./customer-history.service.js";

export const SCORE = {
  frequent: 50,       // يشتريه العميل بشكل متكرر
  cartRelated: 40,    // مرتبط بما في السلة (تكرار مشترك مثبت)
  similar: 20,        // نفس قسم منتج في السلة/المشتريات
  favoriteCategory: 30,
  newInFavorite: 25,  // جديد في قسم يهتم به
  newProduct: 12,     // جديد عمومًا
  popular: 15,        // ضمن الأكثر مبيعًا
  offer: 10,
  featured: 5,
};

// ترتيب اختيار السبب المعروض (الأعلى أولوية)
const REASON_ORDER = ["frequent", "cart_related", "new_in_favorite", "offer_in_favorite", "similar", "popular", "new", "offer", "featured"];

/* ---------- كاش بسيط للبيانات العامة (60 ثانية) ---------- */
const cache = { popular: { at: 0, data: null }, cooccur: { at: 0, data: null } };
const CACHE_MS = 60 * 1000;

/** الأكثر مبيعًا: productId → إجمالي الكمية (طلبات غير ملغاة) */
function getSoldQuantities() {
  const now = Date.now();
  if (cache.popular.data && now - cache.popular.at < CACHE_MS) return cache.popular.data;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT oi.product_id AS id, SUM(oi.quantity) AS qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
       GROUP BY oi.product_id;`
    )
    .all();
  const map = {};
  rows.forEach((r) => { map[r.id] = Number(r.qty) || 0; });
  cache.popular = { at: now, data: map };
  return map;
}

/** التكرار المشترك العام: "a|b" (مرتب) → عدد الطلبات (غير ملغاة) */
function getCooccurrences() {
  const now = Date.now();
  if (cache.cooccur.data && now - cache.cooccur.at < CACHE_MS) return cache.cooccur.data;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.product_id AS a, b.product_id AS b, COUNT(*) AS n
       FROM order_items a
       JOIN order_items b ON b.order_id = a.order_id AND b.product_id > a.product_id
       JOIN orders o ON o.id = a.order_id
       WHERE o.status != 'cancelled'
       GROUP BY a.product_id, b.product_id;`
    )
    .all();
  const map = {};
  rows.forEach((r) => { map[`${r.a}|${r.b}`] = Number(r.n) || 0; });
  cache.cooccur = { at: now, data: map };
  return map;
}

const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * التوصيات الرئيسية.
 * @param {string} customerId اختياري — من جلسة الدخول (أولوية على الهاتف)
 * @param {string} customerPhone اختياري — للتخصيص فقط، ولا يُعاد أي بيانات عنه
 * @param {string[]} cartIds منتجات السلة الحالية (تُستبعد من النتائج)
 * @param {string} category اختياري — حصر في قسم (صفحة المنتج)
 * @param {number} limit 1..12 (افتراضي 4)
 */
export function getRecommendations({ customerId, customerPhone, cartIds, category, limit } = {}) {
  const db = getDb();
  const lim = Math.min(12, Math.max(1, Number(limit) || 4));
  const cart = Array.isArray(cartIds) ? [...new Set(cartIds.map((v) => String(v)).filter(Boolean))].slice(0, 30) : [];
  const cartSet = new Set(cart);

  // العميل وتاريخه (داخلي فقط — لا يخرج في الاستجابة)
  // الجلسة الموثقة أولًا — ولا يُعتمد على هاتف الـFrontend مع وجودها
  let history = null;
  let identified = false;
  if (customerId) {
    identified = true;
    history = getPurchaseHistory(String(customerId));
  } else if (customerPhone) {
    const customer = findCustomerByPhone(customerPhone);
    if (customer) {
      identified = true;
      history = getPurchaseHistory(customer.id);
    }
  }
  const bought = {};
  (history?.products || []).forEach((p) => { bought[p.productId] = Number(p.times) || 0; });
  const favCats = (history?.favoriteCategories || []).map((c) => c.category);
  const favSet = new Set(favCats);

  // فئات منتجات السلة (للتشابه)
  const cartCats = new Set();
  if (cart.length) {
    const ph = cart.map(() => "?").join(",");
    db.prepare(`SELECT DISTINCT category FROM products WHERE id IN (${ph});`)
      .all(...cart)
      .forEach((r) => { if (r.category) cartCats.add(r.category); });
  }

  const sold = getSoldQuantities();
  const cooccur = getCooccurrences();
  const minCo = env.recommendations.minCoOccurrences;
  const topSellers = new Set(
    Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id)
  );

  // المرشحون: متاح + مخزون + سعر صالح (وليس في السلة)
  let rows = db.prepare("SELECT * FROM products;").all();
  if (category) rows = rows.filter((r) => r.category === String(category));
  const candidates = [];
  for (const r of rows) {
    if (cartSet.has(r.id)) continue;
    const price = Number(r.price);
    if (!Number.isFinite(price) || price < 0) continue;
    if (!isPurchasable(r)) continue;
    candidates.push(r);
  }

  // التسجيل
  const scored = candidates.map((r) => {
    let score = 0;
    const reasons = new Set();
    const isFav = favSet.has(r.category);
    const isNew = isNewProduct(r);
    const times = bought[r.id] || 0;

    if (times > 0) { score += SCORE.frequent; reasons.add("frequent"); }
    if (isFav) { score += SCORE.favoriteCategory; }
    if (isNew && isFav) { score += SCORE.newInFavorite; reasons.add("new_in_favorite"); }
    else if (isNew) { score += SCORE.newProduct; reasons.add("new"); }
    if (Number(r.offer) === 1) {
      score += SCORE.offer;
      reasons.add(isFav ? "offer_in_favorite" : "offer");
    }
    if (Number(r.featured) === 1) { score += SCORE.featured; reasons.add("featured"); }
    if (topSellers.has(r.id)) { score += SCORE.popular; reasons.add("popular"); }
    // مرتبط بالسلة؟
    let related = false;
    for (const c of cart) {
      if ((cooccur[pairKey(c, r.id)] || 0) >= minCo) { related = true; break; }
    }
    if (related) { score += SCORE.cartRelated; reasons.add("cart_related"); }
    else if (cartCats.has(r.category) && cart.length) { score += SCORE.similar; reasons.add("similar"); }
    else if (isFav && times === 0) { reasons.add("similar"); }

    const reason = REASON_ORDER.find((x) => reasons.has(x)) || "popular";
    return { row: r, score, reason, times };
  });

  scored.sort((a, b) => b.score - a.score || (Number(b.row.popularity) || 0) - (Number(a.row.popularity) || 0));
  const top = scored.slice(0, lim);

  return {
    recommendations: top.map(({ row, score, reason, times }) => ({
      ...toPublicProduct(row),
      reason,
      score,
      boughtBefore: times > 0,
      timesBought: times,
    })),
    customerType: history && history.products.length ? "returning" : identified ? "new" : "anonymous",
    // لشارات "اشتريته قبل كده" و"بتشتريه كتير" — IDs وأعداد فقط
    boughtBefore: Object.keys(bought).slice(0, 100),
    purchaseCounts: Object.fromEntries(Object.entries(bought).slice(0, 50)),
  };
}
