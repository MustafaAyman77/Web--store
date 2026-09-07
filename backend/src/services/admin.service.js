// ==========================================================================
// أسواق البسيط — Admin Service (الإحصائيات/العملاء/المنتجات للإدارة)
// كل حسابات الأسعار والتحقق هنا في الـ Backend — الواجهة تعرض فقط.
// ==========================================================================
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { logAudit } from "../utils/audit.js";
import { toPublicProduct } from "../controllers/products.controller.js";
import { allowedNext, ORDER_STATUSES, getOrderByIdOrNumber } from "./order.service.js";
import { categoryExists } from "./category.service.js";
import { getPurchaseHistory } from "./customer-history.service.js";
import { accountStatusOf } from "./customer.service.js";
import { revokeAllSessions } from "./customer-session.service.js";

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
      `SELECT id, name, category, image, stock_quantity AS stock,
              low_stock_threshold AS threshold, available FROM products
       WHERE stock_tracking = 1 AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold
       ORDER BY stock_quantity ASC LIMIT 8;`
    )
    .all();
  const lowCount = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE stock_tracking = 1 AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold;")
    .get();
  const outRow = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE stock_tracking = 1 AND stock_quantity IS NOT NULL AND stock_quantity <= 0;")
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
    lowStockCount: lowCount.n || 0,
    outOfStockCount: outRow.n || 0,
    restockCount: (lowCount.n || 0) + (outRow.n || 0),
    ...storeCards(db),
  };
}

function storeCards(db) {
  try {
    const s = db.prepare("SELECT orders_enabled, delivery_enabled, pickup_enabled, maintenance_mode FROM store_settings WHERE id = 1;").get();
    const z = db.prepare("SELECT COUNT(*) AS n FROM delivery_zones WHERE enabled = 1;").get();
    return {
      ordersEnabled: Number(s?.orders_enabled) === 1,
      deliveryEnabled: Number(s?.delivery_enabled) === 1,
      pickupEnabled: Number(s?.pickup_enabled) === 1,
      maintenanceMode: Number(s?.maintenance_mode) === 1,
      zonesCount: z?.n || 0,
    };
  } catch {
    return {};
  }
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

export function listCustomers({ search, sort, page, limit } = {}) {
  const { limit: lim, offset, page: p } = paginate(page, limit);
  const db = getDb();
  const where = search ? "WHERE c.name LIKE ? OR c.phone LIKE ?" : "";
  const like = `%${String(search || "").slice(0, 60)}%`;
  const vals = search ? [like, like] : [];
  const orderBy = sort === "top_spent" ? "totalSpent DESC"
    : sort === "top_orders" ? "ordersCount DESC" : "c.created_at DESC";
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.status, c.account_enabled AS accountEnabled,
              c.phone_verified AS phoneVerified, c.last_login_at AS lastLoginAt, c.created_at AS createdAt,
              COUNT(o.id) AS ordersCount,
              COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS totalSpent,
              MAX(o.created_at) AS lastOrderAt
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       ${where} GROUP BY c.id ORDER BY ${orderBy} LIMIT ? OFFSET ?;`
    )
    .all(...vals, lim, offset);
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM customers c ${where};`)
    .get(...vals);
  const customers = rows.map((r) => ({
    ...r,
    accountEnabled: Number(r.accountEnabled) === 1,
    phoneVerified: Number(r.phoneVerified) === 1,
    accountStatus: accountStatusOf({ status: r.status, account_enabled: r.accountEnabled }),
  }));
  return { customers, total: totalRow.count, limit: lim, offset, page: p };
}

export function setCustomerStatus(id, body, actor) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM customers WHERE id = ?;").get(id);
  if (!existing) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  const patch = {};
  if (body?.status !== undefined) {
    const st = String(body.status);
    if (!["active", "inactive", "blocked"].includes(st)) {
      throw ApiError.badRequest("INVALID_STATUS", "حالة العميل غير صحيحة.");
    }
    patch.status = st;
  }
  if (body?.notes !== undefined) patch.notes = String(body.notes ?? "").trim().slice(0, 500);
  if (body?.account_enabled !== undefined) {
    patch.account_enabled = body.account_enabled ? 1 : 0;
  }
  const keys = Object.keys(patch);
  if (keys.length) {
    const set = keys.map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE customers SET ${set}, updated_at = datetime('now') WHERE id = ?;`)
      .run(...keys.map((k) => patch[k]), id);
  }
  if (keys.length) {
    // تعطيل الحساب أو حظر العميل = إبطال كل جلساته فورًا
    if (patch.account_enabled === 0 || patch.status === "blocked") {
      revokeAllSessions(id);
    }
    logAudit({ actor, action: "customer.update", entity: "customer", entityId: id, meta: { changes: patch } });
  }
  return getCustomerDetails(id);
}

export function getCustomerDetails(id) {
  const db = getDb();
  const customer = db
    .prepare("SELECT id, name, phone, email, address, area, landmark, notes, status, account_enabled AS accountEnabled, phone_verified AS phoneVerified, last_login_at AS lastLoginAt, created_at AS createdAt FROM customers WHERE id = ?;")
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
  const history = getPurchaseHistory(id);
  customer.accountEnabled = Number(customer.accountEnabled) === 1;
  customer.phoneVerified = Number(customer.phoneVerified) === 1;
  customer.accountStatus = accountStatusOf({ status: customer.status, account_enabled: customer.accountEnabled ? 1 : 0 });
  return {
    ...customer, ordersCount: orders.length, totalSpent: spent, orders,
    topProducts: history.products.slice(0, 10),
    favoriteCategories: history.favoriteCategories,
  };
}

/* ================= المنتجات (للإدارة) ================= */

const ADMIN_SORTS = {
  newest: "rowid DESC",
  oldest: "rowid ASC",
  price_asc: "price ASC, name ASC",
  price_desc: "price DESC, name ASC",
  stock_desc: "CASE WHEN stock_quantity IS NULL THEN 1 ELSE 0 END, stock_quantity DESC",
  stock_asc: "CASE WHEN stock_quantity IS NULL THEN 1 ELSE 0 END, stock_quantity ASC",
};

export function listProductsAdmin({ search, category, available, status, sort, page, limit } = {}) {
  const { limit: lim, offset, page: p } = paginate(page, limit);
  const db = getDb();
  const conds = [];
  const vals = [];
  if (category) { conds.push("category = ?"); vals.push(String(category)); }
  if (available === true || available === "1" || available === "true") conds.push("available = 1");
  if (available === false || available === "0" || available === "false") conds.push("available = 0");
  if (status === "available") conds.push("available = 1");
  else if (status === "unavailable") conds.push("available = 0");
  else if (status === "out_of_stock") conds.push("stock_tracking = 1 AND stock_quantity IS NOT NULL AND stock_quantity <= 0");
  else if (status === "low_stock") conds.push("stock_tracking = 1 AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold");
  else if (status === "offer") conds.push("offer = 1");
  else if (status === "featured") conds.push("featured = 1");
  if (search) {
    conds.push("(name LIKE ? OR description LIKE ? OR category LIKE ? OR id LIKE ?)");
    const like = `%${String(search).slice(0, 60)}%`;
    vals.push(like, like, like, like);
  }
  const orderBy = ADMIN_SORTS[sort] || "popularity DESC, name ASC";
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?;`)
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
    const category = cleanStr(b.category, 40);
    if (!category || !categoryExists(category)) throw ApiError.badRequest("INVALID_CATEGORY", "القسم غير صحيح.");
    out.category = category;
  }
  if (b.description !== undefined) out.description = cleanStr(b.description, 500);
  if (isNew || b.price !== undefined) {
    const price = cleanNum(b.price);
    if (!Number.isFinite(price) || price < 0) throw ApiError.badRequest("INVALID_PRICE", "السعر يجب أن يكون رقمًا ≥ صفر.");
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
  if (b.image !== undefined) out.image = cleanStr(b.image, 300);
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
  if (b.lowStockThreshold !== undefined) {
    const t = cleanNum(b.lowStockThreshold);
    if (!Number.isInteger(t) || t < 0) throw ApiError.badRequest("INVALID_THRESHOLD", "حد المخزون المنخفض يجب أن يكون رقمًا صحيحًا ≥ صفر.");
    out.low_stock_threshold = t;
  }
  if (b.stockTracking !== undefined) out.stock_tracking = toBit(b.stockTracking);
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

function assertOldPriceOk(oldPrice, price) {
  if (oldPrice !== null && oldPrice !== undefined && Number(oldPrice) < Number(price)) {
    throw ApiError.badRequest("INVALID_OLD_PRICE", "السعر القديم يجب أن يكون أكبر من أو يساوي السعر الحالي.");
  }
}

function refreshOfferFlag(row) {
  // offer = شارة offer أو سعر قديم أعلى من الحالي
  return row.badge_tone === "offer" || (row.old_price !== null && Number(row.old_price) > Number(row.price)) ? 1 : 0;
}

export function createProduct(body, actor) {
  const data = validateProductInput(body, true);
  assertOldPriceOk(data.old_price ?? null, data.price);
  const db = getDb();
  const id = nextProductId(db);
  const stockQty = data.stock_quantity ?? null;
  const tracking = data.stock_tracking ?? (stockQty === null ? 0 : 1);
  db.prepare(
    `INSERT INTO products
     (id, name, category, description, price, old_price, unit, image, tint,
      badge_text, badge_tone, available, featured, offer, stock_quantity,
      stock_tracking, low_stock_threshold, popularity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
  ).run(
    id, data.name, data.category, data.description ?? "", data.price, data.old_price ?? null,
    data.unit ?? "", data.image ?? "🛒", data.tint ?? JSON.stringify(["#f1f5f9", "#e2e8f0"]),
    data.badge_text ?? "", data.badge_tone ?? "", data.available ?? 1,
    data.featured ?? 0, data.offer ?? 0, stockQty,
    tracking, data.low_stock_threshold ?? 5, data.popularity ?? 50
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
  // مخزون null بدون تحديد التتبع = إيقاف التتبع تلقائيًا
  if (data.stock_quantity === null && data.stock_tracking === undefined) data.stock_tracking = 0;
  const effPrice = data.price ?? Number(existing.price);
  const effOld = (data.old_price !== undefined ? data.old_price : existing.old_price);
  assertOldPriceOk(effOld, effPrice);
  const keys = Object.keys(data);
  if (keys.length) {
    const set = keys.map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE products SET ${set}, updated_at = datetime('now') WHERE id = ?;`)
      .run(...keys.map((k) => data[k]), id);
  }
  const row = db.prepare("SELECT * FROM products WHERE id = ?;").get(id);
  db.prepare("UPDATE products SET offer = ? WHERE id = ?;").run(refreshOfferFlag(row) || (data.offer ? 1 : 0), id);
  const values = {};
  if (data.price !== undefined && Number(existing.price) !== Number(data.price)) {
    values.price = { from: Number(existing.price), to: Number(data.price) };
  }
  if (data.old_price !== undefined && (existing.old_price ?? null) !== (data.old_price ?? null)) {
    values.oldPrice = { from: existing.old_price, to: data.old_price };
  }
  if (data.stock_quantity !== undefined && (existing.stock_quantity ?? null) !== (data.stock_quantity ?? null)) {
    values.stock = { from: existing.stock_quantity, to: data.stock_quantity };
  }
  if (data.available !== undefined && Number(existing.available) !== Number(data.available)) {
    values.available = { from: Number(existing.available) === 1, to: Number(data.available) === 1 };
  }
  logAudit({ actor, action: "product.update", entity: "product", entityId: id, meta: { changes: keys, values } });
  return toPublicProduct(db.prepare("SELECT * FROM products WHERE id = ?;").get(id));
}

/** عمليات جماعية آمنة: تفعيل/تعطيل فقط في هذه المرحلة */
export function bulkUpdateProducts(ids, action, actor) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) {
    throw ApiError.badRequest("INVALID_IDS", "حدد منتجًا واحدًا على الأقل (بحد أقصى 100).");
  }
  const to = action === "activate" ? 1 : action === "deactivate" ? 0 : null;
  if (to === null) throw ApiError.badRequest("INVALID_ACTION", "الإجراء غير صحيح.");
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const info = db.prepare(
    `UPDATE products SET available = ?, updated_at = datetime('now') WHERE id IN (${placeholders});`
  ).run(to, ...ids.map((v) => String(v).slice(0, 40)));
  logAudit({
    actor, action: to ? "product.bulk_activate" : "product.bulk_deactivate",
    entity: "product", entityId: `${info.changes} items`, meta: { count: info.changes },
  });
  return { updated: info.changes };
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
