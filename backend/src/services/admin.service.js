// ==========================================================================
// أسواق البسيط — Admin Service (الإحصائيات/العملاء/المنتجات للإدارة)
// كل حسابات الأسعار والتحقق هنا في الـ Backend — الواجهة تعرض فقط.
// ==========================================================================
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { logAudit } from "../utils/audit.js";
import { toPublicProduct } from "../controllers/products.controller.js";
import { allowedNext, ORDER_STATUSES, getOrderByIdOrNumber } from "./order.service.js";

const PRODUCT_CATEGORIES = [
  "beverages", "snacks", "dairy", "grocery",
  "cleaning", "care", "frozen", "home", "offers",
];

/* ================= نطاق "اليوم" بتوقيت القاهرة ================= */

function tzOffsetMs(ms, tz) {
  const asUTC = new Date(new Date(ms).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const asTz = new Date(new Date(ms).toLocaleString("en-US", { timeZone: tz })).getTime();
  return asTz - asUTC;
}

function cairoTodayRangeUTC() {
  const tz = "Africa/Cairo";
  const dayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const approx = Date.parse(dayStr + "T00:00:00Z");
  const startUtc = approx - tzOffsetMs(approx, tz);
  const nextApprox = startUtc + 26 * 3600 * 1000; // للتأكد من عبور منتصف الليل
  const nextDayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(nextApprox));
  const approx2 = Date.parse(nextDayStr + "T00:00:00Z");
  const endUtc = approx2 - tzOffsetMs(approx2, tz);
  const sql = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  return { start: sql(startUtc), end: sql(endUtc) };
}

/* ================= لوحة المؤشرات ================= */

export function getDashboard() {
  const db = getDb();
  const counts = {};
  ORDER_STATUSES.forEach((s) => { counts[s] = 0; });
  db.prepare("SELECT status, COUNT(*) AS c FROM orders GROUP BY status;")
    .all()
    .forEach((r) => { if (r.status in counts) counts[r.status] = r.c; });

  const { start, end } = cairoTodayRangeUTC();
  const t = db
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS rev
       FROM orders WHERE created_at >= ? AND created_at < ?;`
    )
    .get(start, end);

  const lowStock = db
    .prepare(
      `SELECT id, name, stock_quantity AS stock, available FROM products
       WHERE stock_quantity IS NOT NULL AND stock_quantity <= 5
       ORDER BY stock_quantity ASC LIMIT 8;`
    )
    .all();
  const outRow = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE available = 1 AND stock_quantity IS NOT NULL AND stock_quantity <= 0;")
    .get();

  return {
    newOrders: counts.new || 0,
    confirmedOrders: counts.confirmed || 0,
    preparingOrders: counts.preparing || 0,
    readyOrders: counts.ready || 0,
    outForDeliveryOrders: counts.out_for_delivery || 0,
    completedOrders: counts.completed || 0,
    cancelledOrders: counts.cancelled || 0,
    todayOrders: t.n || 0,
    todayRevenue: t.rev || 0,
    lowStock,
    outOfStockCount: outRow.n || 0,
  };
}

/* ================= تفاصيل طلب (للإدارة) ================= */

export function getAdminOrderDetails(ref) {
  const base = getOrderByIdOrNumber(ref); // يرمي 404 عند عدم الوجود
  const db = getDb();
  const tg = db
    .prepare("SELECT telegram_status, telegram_message_id, telegram_sent_at, telegram_error FROM orders WHERE id = ?;")
    .get(base.orderId) || {};
  return {
    ...base,
    allowedNext: allowedNext(base.status),
    telegram: {
      status: tg.telegram_status || "pending",
      messageId: tg.telegram_message_id ?? null,
      sentAt: tg.telegram_sent_at ?? null,
      error: tg.telegram_error ?? null,
    },
  };
}

/* ================= العملاء ================= */

function paginate(page, limit) {
  limit = Math.min(100, Math.max(1, Number(limit) || 20));
  const p = Math.max(1, Number(page) || 1);
  return { limit, offset: (p - 1) * limit, page: p };
}

export function listCustomers({ search, page, limit } = {}) {
  const { limit: lim, offset, page: p } = paginate(page, limit);
  const db = getDb();
  const where = search ? "WHERE c.name LIKE ? OR c.phone LIKE ?" : "";
  const like = `%${String(search || "").slice(0, 60)}%`;
  const vals = search ? [like, like] : [];
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.created_at AS createdAt,
              COUNT(o.id) AS ordersCount,
              COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS totalSpent,
              MAX(o.created_at) AS lastOrderAt
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?;`
    )
    .all(...vals, lim, offset);
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM customers c ${where};`)
    .get(...vals);
  return { customers: rows, total: totalRow.count, limit: lim, offset, page: p };
}

export function getCustomerDetails(id) {
  const db = getDb();
  const customer = db
    .prepare("SELECT id, name, phone, address, area, landmark, created_at AS createdAt FROM customers WHERE id = ?;")
    .get(id);
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  const orders = db
    .prepare(
      `SELECT o.id, o.order_number AS orderNumber, o.status, o.total,
              o.fulfillment_method AS fulfillmentMethod, o.created_at AS createdAt,
              (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS itemsCount
       FROM orders o WHERE o.customer_id = ? ORDER BY o.created_at DESC;`
    )
    .all(id);
  const spent = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);
  return { ...customer, ordersCount: orders.length, totalSpent: spent, orders };
}

/* ================= المنتجات (للإدارة) ================= */

export function listProductsAdmin({ search, category, available, page, limit } = {}) {
  const { limit: lim, offset, page: p } = paginate(page, limit);
  const db = getDb();
  const conds = [];
  const vals = [];
  if (category) { conds.push("category = ?"); vals.push(String(category)); }
  if (available === true || available === "1" || available === "true") conds.push("available = 1");
  if (available === false || available === "0" || available === "false") conds.push("available = 0");
  if (search) {
    conds.push("(name LIKE ? OR description LIKE ? OR id LIKE ?)");
    const like = `%${String(search).slice(0, 60)}%`;
    vals.push(like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY popularity DESC, name ASC LIMIT ? OFFSET ?;`)
    .all(...vals, lim, offset);
  const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM products ${where};`).get(...vals);
  return { products: rows.map(toPublicProduct), total: totalRow.count, limit: lim, offset, page: p };
}

const cleanStr = (v, max) => String(v ?? "").trim().slice(0, max);
const cleanNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function validateProductInput(body, isNew) {
  const b = body || {};
  const out = {};

  if (isNew || b.name !== undefined) {
    const name = cleanStr(b.name, 120);
    if (name.length < 2) throw ApiError.badRequest("INVALID_NAME", "اسم المنتج مطلوب (حرفان على الأقل).");
    out.name = name;
  }
  if (isNew || b.category !== undefined) {
    const category = cleanStr(b.category, 30);
    if (!PRODUCT_CATEGORIES.includes(category)) throw ApiError.badRequest("INVALID_CATEGORY", "القسم غير صحيح.");
    out.category = category;
  }
  if (b.description !== undefined) out.description = cleanStr(b.description, 500);
  if (isNew || b.price !== undefined) {
    const price = cleanNum(b.price);
    if (!Number.isFinite(price) || price <= 0) throw ApiError.badRequest("INVALID_PRICE", "السعر يجب أن يكون رقمًا أكبر من صفر.");
    out.price = Math.round(price * 100) / 100;
  }
  if (b.oldPrice !== undefined) {
    if (b.oldPrice === null || b.oldPrice === "") out.old_price = null;
    else {
      const op = cleanNum(b.oldPrice);
      if (!Number.isFinite(op) || op < 0) throw ApiError.badRequest("INVALID_OLD_PRICE", "السعر القديم غير صحيح.");
      out.old_price = Math.round(op * 100) / 100;
    }
  }
  if (b.unit !== undefined) out.unit = cleanStr(b.unit, 20);
  if (b.image !== undefined) out.image = cleanStr(b.image, 20);
  if (b.tint !== undefined) {
    if (!Array.isArray(b.tint) || b.tint.length !== 2) throw ApiError.badRequest("INVALID_TINT", "ألوان العرض غير صحيحة.");
    out.tint = JSON.stringify([cleanStr(b.tint[0], 20), cleanStr(b.tint[1], 20)]);
  }
  if (b.badgeText !== undefined) out.badge_text = cleanStr(b.badgeText, 20);
  if (b.badgeTone !== undefined) {
    const tone = cleanStr(b.badgeTone, 10);
    if (tone && !["offer", "hot", "new"].includes(tone)) throw ApiError.badRequest("INVALID_BADGE", "نوع الشارة غير صحيح.");
    out.badge_tone = tone;
  }
  const toBit = (v) => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);
  if (b.available !== undefined) out.available = toBit(b.available);
  if (b.featured !== undefined) out.featured = toBit(b.featured);
  if (b.offer !== undefined) out.offer = toBit(b.offer);
  if (b.stockQuantity !== undefined) {
    if (b.stockQuantity === null || b.stockQuantity === "") out.stock_quantity = null;
    else {
      const s = cleanNum(b.stockQuantity);
      if (!Number.isInteger(s) || s < 0) throw ApiError.badRequest("INVALID_STOCK", "المخزون يجب أن يكون رقمًا صحيحًا ≥ صفر.");
      out.stock_quantity = s;
    }
  }
  if (b.popularity !== undefined) {
    const pop = cleanNum(b.popularity);
    if (!Number.isFinite(pop)) throw ApiError.badRequest("INVALID_POPULARITY", "الشعبية غير صحيحة.");
    out.popularity = Math.max(0, Math.min(100, Math.round(pop)));
  }
  return out;
}

function nextProductId(db) {
  const ids = db.prepare("SELECT id FROM products WHERE id LIKE 'p%';").all().map((r) => r.id);
  let max = 0;
  ids.forEach((id) => {
    const m = /^p(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  let candidate = `p${max + 1}`;
  let guard = 0;
  while (db.prepare("SELECT 1 FROM products WHERE id = ?;").get(candidate) && guard < 1000) {
    max++;
    candidate = `p${max + 1}`;
    guard++;
  }
  return candidate;
}

function refreshOfferFlag(row) {
  // offer = شارة offer أو سعر قديم أعلى من الحالي
  return row.badge_tone === "offer" || (row.old_price !== null && Number(row.old_price) > Number(row.price)) ? 1 : 0;
}

export function createProduct(body, actor) {
  const data = validateProductInput(body, true);
  const db = getDb();
  const id = nextProductId(db);
  db.prepare(
    `INSERT INTO products
     (id, name, category, description, price, old_price, unit, image, tint,
      badge_text, badge_tone, available, featured, offer, stock_quantity, popularity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
  ).run(
    id, data.name, data.category, data.description ?? "", data.price, data.old_price ?? null,
    data.unit ?? "", data.image ?? "🛒", data.tint ?? JSON.stringify(["#f1f5f9", "#e2e8f0"]),
    data.badge_text ?? "", data.badge_tone ?? "", data.available ?? 1,
    data.featured ?? 0, data.offer ?? 0, data.stock_quantity ?? null, data.popularity ?? 50
  );
  const row = db.prepare("SELECT * FROM products WHERE id = ?;").get(id);
  db.prepare("UPDATE products SET offer = ? WHERE id = ?;").run(refreshOfferFlag(row) || (data.offer ? 1 : 0), id);
  logAudit({ actor, action: "product.create", entity: "product", entityId: id, meta: { name: data.name, price: data.price } });
  return toPublicProduct(db.prepare("SELECT * FROM products WHERE id = ?;").get(id));
}

export function updateProduct(id, body, actor) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM products WHERE id = ?;").get(id);
  if (!existing) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
  const data = validateProductInput(body, false);
  const keys = Object.keys(data);
  if (keys.length) {
    const set = keys.map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE products SET ${set}, updated_at = datetime('now') WHERE id = ?;`)
      .run(...keys.map((k) => data[k]), id);
  }
  const row = db.prepare("SELECT * FROM products WHERE id = ?;").get(id);
  db.prepare("UPDATE products SET offer = ? WHERE id = ?;").run(refreshOfferFlag(row) || (data.offer ? 1 : 0), id);
  logAudit({ actor, action: "product.update", entity: "product", entityId: id, meta: { changes: keys } });
  return toPublicProduct(db.prepare("SELECT * FROM products WHERE id = ?;").get(id));
}

/** حذف ناعم: إيقاف التوفر فقط — الطلبات القديمة لا تتأثر */
export function softDeleteProduct(id, actor) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM products WHERE id = ?;").get(id);
  if (!existing) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
  db.prepare("UPDATE products SET available = 0, updated_at = datetime('now') WHERE id = ?;").run(id);
  logAudit({ actor, action: "product.disable", entity: "product", entityId: id, meta: { name: existing.name } });
  return { id, available: false };
}
