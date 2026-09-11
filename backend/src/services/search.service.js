// ==========================================================================
// أسواق البسيط — Smart Search (Stage 13)
// --------------------------------------------------------------------------
// - التطبيع العربي + Fuzzy بسيط + ترتيبtid متعدد المستويات — بدون أي AI خارجي.
// - الكاش يحفظ درجات المطابقة فقط؛ الأسعار/المخزون/العروض تُجلب طازجة دائمًا.
// - منطق خالص على صفوف products → قابل للنقل لأي DB دون إعادة كتابة.
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { toPublicProduct } from "../controllers/products.controller.js";
import { resolvePromosForProducts } from "./promotion.service.js";
import { isPurchasable } from "../utils/product-status.js";

/* ================= التطبيع العربي ================= */

/** تطبيع نص البحث: همزات→ا، ى→ي، ة→ه، بدون تشكيل/ترقيم/مسافات زائدة */
export function normalizeArabic(text) {
  return String(text || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ً-ٰٟـ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function tokensOf(norm) {
  return norm ? norm.split(" ").filter(Boolean).slice(0, 10) : [];
}

/* ================= مسافة التحرير (Fuzzy) ================= */

/** Levenshtein مع حد أقصى للخروج المبكر — للمقارنة بين كلمتين */
export function editDistance(a, b, maxDist = 2) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** حد الخطأ المسموح حسب طول الكلمة: قصيرة=1، طويلة=2 */
function fuzzyThreshold(word) {
  return word.length >= 6 ? 2 : 1;
}

/* ================= التسجيل (Ranking) ================= */

const TIER = { exact: 1000, startsWith: 500, allTokensInName: 300, keyword: 150, fuzzy: 80, category: 60 };

/**
 * درجة مطابقة منتج واحد للاستعلام المطبّع.
 * @returns 0 = لا علاقة، وإلا الدرجة
 */
export function scoreProduct(normQuery, queryTokens, row, catNameNorm) {
  const name = normalizeArabic(row.name);
  if (!name || !normQuery) return 0;
  if (normQuery === name) return TIER.exact;
  if (name.startsWith(normQuery)) return TIER.startsWith;

  const nameWords = tokensOf(name);
  const hayAll = `${name} ${normalizeArabic(row.description)} ${normalizeArabic(row.unit)} ${catNameNorm} ${String(row.category || "").toLowerCase()}`;

  // كل الكلمات في الاسم (ترتيب حر) — مع مكافأة تغطية
  if (queryTokens.length && queryTokens.every((t) => name.includes(t))) {
    const coverage = Math.min(40, Math.round((queryTokens.join("").length / Math.max(1, name.replace(/\s/g, "").length)) * 40));
    return TIER.allTokensInName + coverage;
  }
  // كل الكلمات في (الاسم + الوصف + الوحدة + القسم)
  if (queryTokens.length && queryTokens.every((t) => hayAll.includes(t))) {
    return TIER.keyword;
  }
  // Fuzzy: كل كلمة من الاستعلام قريبة من كلمة في الاسم
  if (queryTokens.length && queryTokens.length <= 3) {
    let totalDist = 0;
    const ok = queryTokens.every((t) => {
      if (t.length < 3) return name.includes(t); // كلمات قصيرة: مطابقة حرفية فقط
      let best = Infinity;
      for (const w of nameWords) {
        if (Math.abs(w.length - t.length) > 2) continue;
        const d = editDistance(t, w, fuzzyThreshold(t));
        if (d < best) best = d;
        if (best === 0) break;
      }
      if (best > fuzzyThreshold(t)) return false;
      totalDist += best;
      return true;
    });
    if (ok) return Math.max(1, TIER.fuzzy - totalDist * 8);
  }
  // مطابقة القسم فقط (اسم عام مثل "مشروبات")
  if (queryTokens.length && queryTokens.every((t) => t.length >= 3 && (catNameNorm.includes(t) || String(row.category || "").toLowerCase().includes(t)))) {
    return TIER.category;
  }
  return 0;
}

/* ================= كاش الدرجات (IDs + tiers فقط) ================= */

const rankCache = new Map(); // key → { at, ranked: [{id, tier}] }
const RANK_TTL_MS = 45 * 1000;
const RANK_MAX = 200;

function rankCacheGet(key) {
  const hit = rankCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > RANK_TTL_MS) { rankCache.delete(key); return null; }
  return hit.ranked;
}
function rankCacheSet(key, ranked) {
  if (rankCache.size >= RANK_MAX) {
    const oldest = rankCache.keys().next().value;
    rankCache.delete(oldest);
  }
  rankCache.set(key, { at: Date.now(), ranked });
}
export function clearSearchCache() { rankCache.clear(); }

/* ================= البحث الرئيسي ================= */

const SORTS = ["relevance", "newest", "popular", "price-asc", "price-desc"];

function parsePriceParam(v, name) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest("INVALID_PRICE_FILTER", "قيمة السعر غير صحيحة.");
  }
  return Math.round(n * 100) / 100;
}

function toBoolParam(v) {
  if (v === undefined || v === null || v === "") return null;
  return ["1", "true", "yes"].includes(String(v).toLowerCase());
}

/**
 * تنفيذ البحث + الترشيح + الترتيب + الصفحات.
 * @returns {{ query, normalizedQuery, page, limit, total, results, didYouMean }}
 */
export function runSearch(params = {}, customerId = null) {
  const rawQuery = String(params.q ?? "").trim().slice(0, 100);
  const normQuery = normalizeArabic(rawQuery);
  if (!normQuery) {
    throw ApiError.badRequest("EMPTY_QUERY", "اكتب كلمة البحث أولًا.");
  }
  const queryTokens = tokensOf(normQuery);

  let minPrice = parsePriceParam(params.minPrice, "minPrice");
  let maxPrice = parsePriceParam(params.maxPrice, "maxPrice");
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice]; // تبديل لطيف بدل الخطأ
  }
  const category = String(params.category || "").trim().slice(0, 60);
  const availableOnly = toBoolParam(params.available);
  const offerOnly = toBoolParam(params.offer);
  const sort = SORTS.includes(params.sort) ? params.sort : "relevance";
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
  const page = Math.max(1, Number(params.page) || 1);

  const db = getDb();

  // الدرجات (من الكاش أو بحساب طازج) — IDs فقط
  const cacheKey = `${normQuery}|${category}`;
  let ranked = rankCacheGet(cacheKey);
  if (!ranked) {
    const catRows = db.prepare("SELECT slug, name FROM categories WHERE active = 1;").all();
    const catNorm = {};
    catRows.forEach((c) => { catNorm[c.slug] = normalizeArabic(c.name); });
    let rows = category
      ? db.prepare("SELECT * FROM products WHERE category = ?;").all(category)
      : db.prepare("SELECT * FROM products;").all();
    ranked = [];
    for (const r of rows) {
      const tier = scoreProduct(normQuery, queryTokens, r, catNorm[r.category] || normalizeArabic(r.category));
      if (tier > 0) ranked.push({ id: r.id, tier });
    }
    ranked.sort((a, b) => b.tier - a.tier);
    rankCacheSet(cacheKey, ranked);
  }

  // الترطيب الطازج: صفوف حالية + عروض حالية (لا كاش للأسعار/المخزون)
  const ids = ranked.map((r) => r.id);
  const tierById = {};
  ranked.forEach((r) => { tierById[r.id] = r.tier; });
  let rows = [];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    rows = db.prepare(`SELECT * FROM products WHERE id IN (${ph});`).all(...ids);
    if (category) rows = rows.filter((r) => r.category === category);
  }
  const promoMap = resolvePromosForProducts(db, rows.map((r) => r.id));

  // الترشيح على بيانات طازجة
  let filtered = rows.map((r) => {
    const hit = promoMap[r.id];
    const base = Number(r.price);
    const finalPrice = hit ? hit.finalPrice : base;
    return { row: r, tier: tierById[r.id] || 0, finalPrice, hasPromo: !!hit };
  });
  if (availableOnly) filtered = filtered.filter((x) => isPurchasable(x.row));
  if (offerOnly) filtered = filtered.filter((x) => x.hasPromo);
  if (minPrice !== null) filtered = filtered.filter((x) => x.finalPrice >= minPrice);
  if (maxPrice !== null) filtered = filtered.filter((x) => x.finalPrice <= maxPrice);

  // الترتيب — غير المتاح لا يتقدم على المتاح أبدًا
  const availRank = (x) => (isPurchasable(x.row) ? 0 : 1);
  const byPop = (a, b) => (Number(b.row.popularity) || 0) - (Number(a.row.popularity) || 0);
  const byPromo = (a, b) => (b.hasPromo ? 1 : 0) - (a.hasPromo ? 1 : 0);
  if (sort === "newest") {
    filtered.sort((a, b) => availRank(a) - availRank(b) || String(b.row.created_at).localeCompare(String(a.row.created_at)) || byPop(a, b));
  } else if (sort === "popular") {
    filtered.sort((a, b) => availRank(a) - availRank(b) || byPop(a, b) || byPromo(a, b));
  } else if (sort === "price-asc") {
    filtered.sort((a, b) => availRank(a) - availRank(b) || a.finalPrice - b.finalPrice || byPop(a, b));
  } else if (sort === "price-desc") {
    filtered.sort((a, b) => availRank(a) - availRank(b) || b.finalPrice - a.finalPrice || byPop(a, b));
  } else {
    filtered.sort((a, b) => availRank(a) - availRank(b) || b.tier - a.tier || byPop(a, b) || byPromo(a, b));
  }

  const total = filtered.length;
  const slice = filtered.slice((page - 1) * limit, page * limit);
  const results = slice.map((x) => toPublicProduct(x.row, promoMap));

  // تصحيح "هل تقصد؟" عند ضعف النتائج — من منتجات موجودة فعلًا
  let didYouMean = null;
  if (total === 0) {
    didYouMean = suggestCorrection(db, normQuery, queryTokens, category);
  }

  logSearchEvent(db, { customerId, query: rawQuery, normalizedQuery: normQuery, resultsCount: total });

  return { query: rawQuery, normalizedQuery: normQuery, page, limit, total, results, didYouMean };
}

/** أقرب اسم منتج للاستعلام (للتصحيح) — null عند عدم وجود مرشح واثق */
export function suggestCorrection(db, normQuery, queryTokens, category = "") {
  const tokens = queryTokens || tokensOf(normQuery);
  if (!tokens.length || tokens.length > 3) return null;
  const rows = category
    ? db.prepare("SELECT id, name FROM products WHERE category = ? AND available = 1;").all(category)
    : db.prepare("SELECT id, name FROM products WHERE available = 1;").all();
  let best = null;
  for (const r of rows) {
    const words = tokensOf(normalizeArabic(r.name));
    for (const t of tokens) {
      if (t.length < 3) continue;
      for (const w of words) {
        if (w.length < 3 || Math.abs(w.length - t.length) > 2) continue;
        const d = editDistance(t, w, 2);
        // التصحيح متساهل أكثر من التسجيل (المستخدم يؤكد بالزر — لا تغيير تلقائي)
        if (d >= 1 && d <= 2 && (!best || d < best.dist)) {
          best = { name: r.name, dist: d };
        }
      }
    }
  }
  return best ? best.name : null;
}

/* ================= الاقتراحات (Suggestions) ================= */

export function getSuggestions(q, limit = 6) {
  const norm = normalizeArabic(q);
  if (!norm) return [];
  const lim = Math.min(8, Math.max(1, Number(limit) || 6));
  const db = getDb();
  const rows = db.prepare("SELECT id, name, category FROM products WHERE available = 1 ORDER BY popularity DESC;").all();
  const out = [];
  const seen = new Set();
  const push = (text, type, extra) => {
    const key = type + ":" + text;
    if (seen.has(key) || out.length >= lim) return;
    seen.add(key);
    out.push({ text, type, ...extra });
  };
  // 1) أسماء تبدأ بالاستعلام
  for (const r of rows) {
    if (normalizeArabic(r.name).startsWith(norm)) push(r.name, "product", { productId: r.id });
    if (out.length >= lim) return out;
  }
  // 2) كلمات داخل الاسم تبدأ بالاستعلام
  for (const r of rows) {
    if (tokensOf(normalizeArabic(r.name)).some((w) => w.startsWith(norm) && w !== norm)) {
      push(r.name, "product", { productId: r.id });
    }
    if (out.length >= lim) return out;
  }
  // 3) أقسام مطابقة
  try {
    const cats = db.prepare("SELECT slug, name FROM categories WHERE active = 1;").all();
    for (const c of cats) {
      if (normalizeArabic(c.name).includes(norm)) push(c.name, "category", { category: c.slug });
      if (out.length >= lim) break;
    }
  } catch { /* تجاهل */ }
  return out;
}

/* ================= الأكثر بحثًا ================= */

export function getPopularSearches(limit = 8) {
  const lim = Math.min(12, Math.max(1, Number(limit) || 8));
  const db = getDb();
  try {
    return db.prepare(
      `SELECT normalized_query AS query, COUNT(*) AS count FROM search_events
       GROUP BY normalized_query ORDER BY count DESC, MAX(created_at) DESC LIMIT ?;`
    ).all(lim);
  } catch {
    return [];
  }
}

/* ================= التحليلات (تسجيل + إدارة) ================= */

export function logSearchEvent(db, { customerId, query, normalizedQuery, resultsCount }) {
  try {
    (db || getDb()).prepare(
      "INSERT INTO search_events (id, customer_id, query, normalized_query, results_count) VALUES (?, ?, ?, ?, ?);"
    ).run(uuidv4(), customerId || null, String(query || "").slice(0, 100), String(normalizedQuery || "").slice(0, 100), Number(resultsCount) || 0);
  } catch { /* التحليلات لا تكسر البحث أبدًا */ }
}

/** ملخص الإدارة: إجمالي + الأعلى + بدون نتائج — بدون أي بيانات شخصية */
export function getSearchAnalytics() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) AS n FROM search_events;").get()?.n || 0;
  const topQueries = db.prepare(
    `SELECT normalized_query AS query, COUNT(*) AS count FROM search_events
     GROUP BY normalized_query ORDER BY count DESC LIMIT 20;`
  ).all();
  const zeroResultQueries = db.prepare(
    `SELECT normalized_query AS query, COUNT(*) AS count FROM search_events WHERE results_count = 0
     GROUP BY normalized_query ORDER BY count DESC LIMIT 20;`
  ).all();
  return { totalSearches: total, topQueries, zeroResultQueries };
}
