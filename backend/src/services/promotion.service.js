// ==========================================================================
// أسواق البسيط — العروض الترويجية (Stage 12)
// --------------------------------------------------------------------------
// - مصدر الحقيقة للأسعار النهائية: enabled + الفترة الزمنية + الأولوية.
// - عرض واحد فقط لكل منتج (الأعلى أولوية، ثم الأقل سعرًا) — لا تكديس.
// - الأوقات UTC بصيغة 'YYYY-MM-DD HH:MM:SS' — تُقارن مع datetime('now').
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";

export const PROMO_TYPES = ["percentage", "fixed_discount", "fixed_price"];

/** تطبيع تاريخ مدخل (ISO/datetime-local) إلى UTC 'YYYY-MM-DD HH:MM:SS' أو null */
export function normalizeTs(v) {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v).includes("T") || String(v).includes("Z") ? v : String(v).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return undefined; // صيغة مرفوضة
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** السعر النهائي بعد عرض واحد — null إذا غير صالح لهذا السعر */
export function finalPriceFor(basePrice, promo) {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  let final = null;
  if (promo.type === "percentage") {
    const pct = Number(promo.discount_value);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
    final = base * (1 - pct / 100);
  } else if (promo.type === "fixed_discount") {
    const off = Number(promo.discount_value);
    if (!Number.isFinite(off) || off <= 0 || off >= base) return null;
    final = base - off;
  } else if (promo.type === "fixed_price") {
    const fp = Number(promo.fixed_price);
    if (!Number.isFinite(fp) || fp < 1 || fp >= base) return null;
    final = fp;
  } else {
    return null;
  }
  return Math.round(final * 100) / 100;
}

function activeClause(alias = "p") {
  return `(${alias}.enabled = 1 AND (${alias}.start_at IS NULL OR ${alias}.start_at <= datetime('now')) AND (${alias}.end_at IS NULL OR ${alias}.end_at > datetime('now')))`;
}

/**
 * العرض الفائز لكل منتج: { productId: { promo, finalPrice } }
 * @param {object} db اتصال (للاستخدام داخل Transaction أيضًا)
 */
export function resolvePromosForProducts(db, productIds) {
  const ids = [...new Set((productIds || []).map(String).filter(Boolean))];
  if (!ids.length) return {};
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT pp.product_id AS productId, p.*
       FROM promotion_products pp JOIN promotions p ON p.id = pp.promotion_id
       WHERE pp.product_id IN (${ph}) AND ${activeClause()};`
    )
    .all(...ids);
  const prices = {};
  db.prepare(`SELECT id, price FROM products WHERE id IN (${ph});`).all(...ids)
    .forEach((r) => { prices[r.id] = Number(r.price); });

  const byProduct = {};
  rows.forEach((r) => {
    (byProduct[r.productId] = byProduct[r.productId] || []).push(r);
  });
  const out = {};
  for (const [pid, promos] of Object.entries(byProduct)) {
    const base = prices[pid];
    if (!Number.isFinite(base) || base <= 0) continue;
    let best = null;
    for (const pr of promos) {
      const final = finalPriceFor(base, pr);
      if (final === null || final >= base) continue; // يتجاهل غير المجدية
      const cand = { promo: pr, finalPrice: final };
      if (!best ||
          Number(pr.priority) > Number(best.promo.priority) ||
          (Number(pr.priority) === Number(best.promo.priority) && final < best.finalPrice)) {
        best = cand;
      }
    }
    if (best) out[pid] = best;
  }
  return out;
}

/** حالة العرض للعرض: active | upcoming | expired | disabled */
export function promoStatus(promo) {
  if (Number(promo.enabled) !== 1) return "disabled";
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  if (promo.start_at && promo.start_at > now) return "upcoming";
  if (promo.end_at && promo.end_at <= now) return "expired";
  return "active";
}

function toPublicPromo(p, productCount) {
  return {
    id: p.id, name: p.name, description: p.description || "",
    type: p.type,
    discountValue: p.type === "fixed_price" ? null : Number(p.discount_value),
    fixedPrice: p.type === "fixed_price" ? Number(p.fixed_price) : null,
    startAt: p.start_at, endAt: p.end_at,
    priority: Number(p.priority) || 0,
    status: promoStatus(p),
    productCount: productCount ?? 0,
  };
}

/* ================= قراءة عامة (النشطة فقط) ================= */

export function listActivePromotions() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM promotions p WHERE ${activeClause()} ORDER BY p.priority DESC, p.end_at ASC;`).all();
  const counts = {};
  db.prepare("SELECT promotion_id AS pid, COUNT(*) AS n FROM promotion_products GROUP BY promotion_id;").all()
    .forEach((r) => { counts[r.pid] = r.n; });
  return rows.map((p) => toPublicPromo(p, counts[p.id] || 0));
}

export function getActivePromotion(id) {
  const db = getDb();
  const p = db.prepare(`SELECT * FROM promotions p WHERE p.id = ? AND ${activeClause()};`).get(id);
  if (!p) throw ApiError.notFound("PROMOTION_NOT_FOUND", "العرض غير موجود.");
  const products = db.prepare(
    "SELECT pr.id, pr.name, pr.category, pr.price, pr.image FROM promotion_products pp JOIN products pr ON pr.id = pp.product_id WHERE pp.promotion_id = ? AND pr.available = 1;"
  ).all(id);
  return { ...toPublicPromo(p, products.length), products };
}

/* ================= إدارة (CRUD) ================= */

export function listAdminPromotions({ status, page, limit } = {}) {
  const db = getDb();
  let rows = db.prepare("SELECT * FROM promotions ORDER BY enabled DESC, priority DESC, created_at DESC;").all();
  const counts = {};
  db.prepare("SELECT promotion_id AS pid, COUNT(*) AS n FROM promotion_products GROUP BY promotion_id;").all()
    .forEach((r) => { counts[r.pid] = r.n; });
  let list = rows.map((p) => toPublicPromo(p, counts[p.id] || 0));
  if (status) list = list.filter((p) => p.status === String(status));
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const pg = Math.max(1, Number(page) || 1);
  return { promotions: list.slice((pg - 1) * lim, pg * lim), total: list.length, limit: lim, page: pg };
}

export function getAdminPromotion(id) {
  const db = getDb();
  const p = db.prepare("SELECT * FROM promotions WHERE id = ?;").get(id);
  if (!p) throw ApiError.notFound("PROMOTION_NOT_FOUND", "العرض غير موجود.");
  const products = db.prepare(
    "SELECT pr.id, pr.name, pr.category, pr.price, pr.available, pr.stock_quantity AS stock FROM promotion_products pp JOIN products pr ON pr.id = pp.product_id WHERE pp.promotion_id = ?;"
  ).all(id);
  return { ...toPublicPromo(p, products.length), enabled: Number(p.enabled) === 1, products };
}

function validatePromoInput(db, body, isUpdate = false) {
  const b = body || {};
  const out = {};
  if (b.name !== undefined || !isUpdate) {
    const name = String(b.name ?? "").trim().slice(0, 120);
    if (name.length < 2) throw ApiError.badRequest("INVALID_PROMO_NAME", "اسم العرض قصير جدًا.");
    out.name = name;
  }
  if (b.description !== undefined) out.description = String(b.description ?? "").trim().slice(0, 500);
  if (b.type !== undefined || !isUpdate) {
    if (!PROMO_TYPES.includes(b.type)) throw ApiError.badRequest("INVALID_PROMO_TYPE", "نوع العرض غير معروف.");
    out.type = b.type;
  }
  if (b.priority !== undefined) {
    const pr = Number(b.priority);
    if (!Number.isInteger(pr) || pr < 0 || pr > 1000) throw ApiError.badRequest("INVALID_PRIORITY", "الأولوية من 0 إلى 1000.");
    out.priority = pr;
  }
  if (b.enabled !== undefined) out.enabled = b.enabled ? 1 : 0;
  if (b.startAt !== undefined || b.start_at !== undefined) {
    const v = normalizeTs(b.startAt ?? b.start_at);
    if (v === undefined) throw ApiError.badRequest("INVALID_START", "تاريخ البداية غير صحيح.");
    out.start_at = v;
  }
  if (b.endAt !== undefined || b.end_at !== undefined) {
    const v = normalizeTs(b.endAt ?? b.end_at);
    if (v === undefined) throw ApiError.badRequest("INVALID_END", "تاريخ النهاية غير صحيح.");
    out.end_at = v;
  }
  return out;
}

function validateMoney(type, body, products) {
  if (type === "percentage") {
    const pct = Number(body.discountValue ?? body.discount_value);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      throw ApiError.badRequest("INVALID_DISCOUNT", "نسبة الخصم يجب أن تكون بين 1 و 99.");
    }
    return { discount_value: Math.round(pct * 100) / 100, fixed_price: null };
  }
  if (type === "fixed_discount") {
    const off = Number(body.discountValue ?? body.discount_value);
    if (!Number.isFinite(off) || off <= 0) throw ApiError.badRequest("INVALID_DISCOUNT", "قيمة الخصم غير صحيحة.");
    for (const p of products) {
      if (off >= Number(p.price)) {
        throw ApiError.badRequest("DISCOUNT_TOO_HIGH", `الخصم أكبر من سعر «${p.name}».`);
      }
    }
    return { discount_value: Math.round(off * 100) / 100, fixed_price: null };
  }
  // fixed_price
  const fp = Number(body.fixedPrice ?? body.fixed_price);
  if (!Number.isFinite(fp) || fp < 1) {
    throw ApiError.badRequest("INVALID_FIXED_PRICE", "سعر العرض يجب أن يكون جنيهًا واحدًا على الأقل.");
  }
  for (const p of products) {
    if (fp >= Number(p.price)) {
      throw ApiError.badRequest("INVALID_FIXED_PRICE", `سعر العرض يجب أن يكون أقل من سعر «${p.name}».`);
    }
  }
  return { discount_value: 0, fixed_price: Math.round(fp * 100) / 100 };
}

function fetchProductsOrThrow(db, ids) {
  const uniq = [...new Set((ids || []).map((v) => String(v || "").trim()).filter(Boolean))].slice(0, 200);
  if (!uniq.length) throw ApiError.badRequest("NO_PRODUCTS", "اختر منتجًا واحدًا على الأقل.");
  const ph = uniq.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM products WHERE id IN (${ph});`).all(...uniq);
  if (rows.length !== uniq.length) {
    throw ApiError.notFound("PRODUCT_NOT_FOUND", "أحد المنتجات المختارة غير موجود.");
  }
  for (const r of rows) {
    if (Number(r.available) !== 1) {
      throw ApiError.badRequest("PRODUCT_UNAVAILABLE", `«${r.name}» غير متاح حاليًا.`);
    }
  }
  return rows;
}

export function createPromotion(body) {
  const db = getDb();
  const patch = validatePromoInput(db, body, false);
  const products = fetchProductsOrThrow(db, body.productIds || body.product_ids);
  const money = validateMoney(patch.type, body, products);
  if (patch.start_at && patch.end_at && patch.end_at <= patch.start_at) {
    throw ApiError.badRequest("INVALID_RANGE", "تاريخ النهاية يجب أن يكون بعد تاريخ البداية.");
  }
  const id = uuidv4();
  db.prepare(
    "INSERT INTO promotions (id, name, description, type, discount_value, fixed_price, start_at, end_at, enabled, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
  ).run(id, patch.name, patch.description ?? "", patch.type, money.discount_value, money.fixed_price,
    patch.start_at ?? null, patch.end_at ?? null, patch.enabled ?? 1, patch.priority ?? 0);
  const ins = db.prepare("INSERT INTO promotion_products (id, promotion_id, product_id) VALUES (?, ?, ?);");
  products.forEach((p) => ins.run(uuidv4(), id, p.id));
  return getAdminPromotion(id);
}

export function updatePromotion(id, body) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM promotions WHERE id = ?;").get(id);
  if (!existing) throw ApiError.notFound("PROMOTION_NOT_FOUND", "العرض غير موجود.");
  const patch = validatePromoInput(db, body, true);
  const type = patch.type || existing.type;
  let products = null;
  if (body.productIds !== undefined || body.product_ids !== undefined) {
    products = fetchProductsOrThrow(db, body.productIds || body.product_ids);
  } else {
    products = db.prepare(
      "SELECT pr.* FROM promotion_products pp JOIN products pr ON pr.id = pp.product_id WHERE pp.promotion_id = ?;"
    ).all(id);
  }
  // تحقق مالي إذا تغير النوع/القيم أو المنتجات
  const moneyTouched = patch.type || body.discountValue !== undefined || body.discount_value !== undefined ||
    body.fixedPrice !== undefined || body.fixed_price !== undefined || products.length !== undefined && (body.productIds !== undefined || body.product_ids !== undefined);
  const money = moneyTouched
    ? validateMoney(type, {
        discountValue: body.discountValue ?? body.discount_value ?? existing.discount_value,
        fixedPrice: body.fixedPrice ?? body.fixed_price ?? existing.fixed_price,
      }, products)
    : null;
  const startAt = patch.start_at !== undefined ? patch.start_at : existing.start_at;
  const endAt = patch.end_at !== undefined ? patch.end_at : existing.end_at;
  if (startAt && endAt && endAt <= startAt) {
    throw ApiError.badRequest("INVALID_RANGE", "تاريخ النهاية يجب أن يكون بعد تاريخ البداية.");
  }
  const cols = { ...patch };
  if (money) { cols.discount_value = money.discount_value; cols.fixed_price = money.fixed_price; }
  delete cols.type; // النوع يُحفظ أدناه صراحة
  cols.type = type;
  const keys = Object.keys(cols);
  if (keys.length) {
    db.prepare(`UPDATE promotions SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?;`)
      .run(...keys.map((k) => cols[k]), id);
  }
  if (body.productIds !== undefined || body.product_ids !== undefined) {
    db.prepare("DELETE FROM promotion_products WHERE promotion_id = ?;").run(id);
    const ins = db.prepare("INSERT INTO promotion_products (id, promotion_id, product_id) VALUES (?, ?, ?);");
    products.forEach((p) => ins.run(uuidv4(), id, p.id));
  }
  return getAdminPromotion(id);
}

export function setPromotionEnabled(id, enabled) {
  const db = getDb();
  const p = db.prepare("SELECT * FROM promotions WHERE id = ?;").get(id);
  if (!p) throw ApiError.notFound("PROMOTION_NOT_FOUND", "العرض غير موجود.");
  db.prepare("UPDATE promotions SET enabled = ?, updated_at = datetime('now') WHERE id = ?;").run(enabled ? 1 : 0, id);
  return getAdminPromotion(id);
}

/** حذف ذكي: مستخدم في طلبات → تعطيل؛ غير مستخدم → حذف حقيقي */
export function deletePromotion(id) {
  const db = getDb();
  const p = db.prepare("SELECT * FROM promotions WHERE id = ?;").get(id);
  if (!p) throw ApiError.notFound("PROMOTION_NOT_FOUND", "العرض غير موجود.");
  const used = db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE promotion_id = ?;").get(id).n;
  if (used > 0) {
    db.prepare("UPDATE promotions SET enabled = 0, updated_at = datetime('now') WHERE id = ?;").run(id);
    return { deleted: false, disabled: true, linkedOrders: used };
  }
  db.prepare("DELETE FROM promotions WHERE id = ?;").run(id); // CASCADE للربط
  return { deleted: true, disabled: false, linkedOrders: 0 };
}

/** بطاقات اللوحة: النشطة + تنتهي خلال 48 ساعة + منتجات عليها عروض */
export function promoDashboard() {
  const db = getDb();
  try {
    const active = db.prepare(`SELECT COUNT(*) AS n FROM promotions p WHERE ${activeClause()};`).get().n;
    const soon = db.prepare(
      `SELECT COUNT(*) AS n FROM promotions p WHERE ${activeClause()} AND p.end_at IS NOT NULL AND p.end_at <= datetime('now', '+48 hours');`
    ).get().n;
    const prods = db.prepare(
      `SELECT COUNT(DISTINCT pp.product_id) AS n FROM promotion_products pp JOIN promotions p ON p.id = pp.promotion_id WHERE ${activeClause()};`
    ).get().n;
    return { activePromotions: active, endingSoonPromotions: soon, productsOnPromo: prods };
  } catch {
    return {};
  }
}
