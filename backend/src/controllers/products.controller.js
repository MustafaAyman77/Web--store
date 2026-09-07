// ==========================================================================
// Products Controller — قراءة المنتجات (بحث/قسم/توفر/مميز/عروض)
// ==========================================================================
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { stockStatusOf, discountPercent, isPurchasable, adminStatusOf } from "../utils/product-status.js";

/** تطبيع النص العربي للبحث (نفس منطق الواجهة) */
function normalizeAr(str) {
  return String(str || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPublicProduct(row) {
  let tint = [];
  try { tint = JSON.parse(row.tint || "[]"); } catch { tint = []; }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || "",
    price: Number(row.price),
    oldPrice: row.old_price !== null ? Number(row.old_price) : null,
    unit: row.unit || "",
    image: row.image || "",
    tint,
    badge: row.badge_text ? { text: row.badge_text, tone: row.badge_tone || "offer" } : null,
    available: Number(row.available) === 1,
    featured: Number(row.featured) === 1,
    offer: Number(row.offer) === 1,
    stockQuantity: row.stock_quantity,
    stockTracking: Number(row.stock_tracking ?? 1) === 1,
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    stockStatus: stockStatusOf(row),
    purchasable: isPurchasable(row),
    status: adminStatusOf(row),
    discountPercent: discountPercent(row.price, row.old_price),
    popularity: Number(row.popularity) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBoolQuery(v) {
  if (v === undefined) return null;
  return ["1", "true", "yes"].includes(String(v).toLowerCase());
}

export function listProducts(req, res) {
  const db = getDb();
  const { category, search } = req.query;
  const available = toBoolQuery(req.query.available);
  const featured = toBoolQuery(req.query.featured);
  const offer = toBoolQuery(req.query.offer);

  let rows = db.prepare("SELECT * FROM products ORDER BY popularity DESC, name ASC;").all();
  if (category) rows = rows.filter((p) => p.category === String(category));
  if (available !== null) rows = rows.filter((p) => (Number(p.available) === 1) === available);
  if (featured !== null) rows = rows.filter((p) => (Number(p.featured) === 1) === featured);
  if (offer !== null) rows = rows.filter((p) => (Number(p.offer) === 1) === offer);
  if (search) {
    const words = normalizeAr(search).split(" ").filter(Boolean);
    rows = rows.filter((p) => {
      const hay = normalizeAr(`${p.name} ${p.description} ${p.unit} ${p.category}`);
      return words.every((w) => hay.includes(w));
    });
  }

  res.json({ success: true, data: { products: rows.map(toPublicProduct), total: rows.length } });
}

export function getProductById(req, res) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM products WHERE id = ? AND available = 1;").get(req.params.id);
  if (!row) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
  res.json({ success: true, data: toPublicProduct(row) });
}
