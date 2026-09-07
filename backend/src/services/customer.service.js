// ==========================================================================
// أسواق البسيط — Customer Service (التعرف على العميل برقم الهاتف)
// رقم الهاتف UNIQUE هو المفتاح — ممنوع تكرار العميل لنفس الرقم.
// ==========================================================================
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { getCustomerStats } from "./customer-history.service.js";

export function findCustomerByPhone(phone) {
  const db = getDb();
  const p = String(phone || "").trim();
  if (!p) return null;
  return db.prepare("SELECT * FROM customers WHERE phone = ?;").get(p) || null;
}

export function getCustomerRowById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM customers WHERE id = ?;").get(id);
  if (!row) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  return row;
}

/** بروفايل عام آمن — بدون ملاحظات داخلية أو حالة الحظر */
export function getPublicProfile(id) {
  const row = getCustomerRowById(id);
  const stats = getCustomerStats(id);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address || "",
    area: row.area || "",
    landmark: row.landmark || "",
    totalOrders: stats.totalOrders,
    totalSpent: stats.totalSpent,
    lastOrderAt: stats.lastOrderAt,
  };
}

/** حالة الحساب: guest | registered | blocked */
export function accountStatusOf(row) {
  if (!row) return "guest";
  if (row.status === "blocked") return "blocked";
  return Number(row.account_enabled) === 1 ? "registered" : "guest";
}

/** بيانات العميل الآمنة للجلسة — بدون IDs داخلية أو أسرار */
export function toSafeCustomer(row) {
  if (!row) return null;
  return {
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    address: row.address || "",
    area: row.area || "",
    landmark: row.landmark || "",
    accountStatus: accountStatusOf(row),
  };
}

/** تفاصيل طلب للعميل نفسه فقط — 404 لأي طلب لا يخصه (بدون تسريب) */
export function getMyOrderDetails(customerId, orderNumber) {
  const db = getDb();
  const ref = String(orderNumber || "").trim().slice(0, 40);
  const order = db
    .prepare("SELECT * FROM orders WHERE order_number = ? AND customer_id = ?;")
    .get(ref, customerId);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", "الطلب غير موجود.");
  const items = db
    .prepare("SELECT product_id AS productId, product_name AS name, quantity, price, subtotal FROM order_items WHERE order_id = ?;")
    .all(order.id);
  return {
    orderNumber: order.order_number,
    status: order.status,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    total: order.total,
    fulfillmentMethod: order.fulfillment_method,
    notes: order.notes || "",
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items,
    statusHistory: getStatusHistorySafe(order.id),
  };
}

function getStatusHistorySafe(orderId) {
  try {
    const db = getDb();
    return db
      .prepare("SELECT status, created_at AS createdAt FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC;")
      .all(orderId);
  } catch {
    return [];
  }
}

/** تعديل البروفايل — الهاتف لا يتغير هنا أبدًا */
export function updateMyProfile(customerId, body) {
  const db = getDb();
  const clean = (v, max) => String(v ?? "").trim().slice(0, max);
  const patch = {};
  if (body?.name !== undefined) {
    const name = clean(body.name, 100).replace(/\s+/g, " ");
    if (name.length < 3) throw ApiError.badRequest("INVALID_NAME", "من فضلك أدخل اسمك بالكامل.");
    patch.name = name;
  }
  if (body?.email !== undefined) {
    const email = clean(body.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw ApiError.badRequest("INVALID_EMAIL", "البريد الإلكتروني غير صحيح.");
    }
    patch.email = email;
  }
  if (body?.address !== undefined) patch.address = clean(body.address, 300);
  if (body?.area !== undefined) patch.area = clean(body.area, 100);
  if (body?.landmark !== undefined) patch.landmark = clean(body.landmark, 200);
  const keys = Object.keys(patch);
  if (!keys.length) throw ApiError.badRequest("NOTHING_TO_UPDATE", "لا توجد بيانات لتحديثها.");
  db.prepare(`UPDATE customers SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?;`)
    .run(...keys.map((k) => patch[k]), customerId);
  return toSafeCustomer(getCustomerRowById(customerId));
}

/** إلغاء الحساب — تعطيل فقط، مع الحفاظ على العميل والطلبات */
export function deactivateAccount(customerId) {
  const db = getDb();
  db.prepare("UPDATE customers SET account_enabled = 0, updated_at = datetime('now') WHERE id = ?;").run(customerId);
}

/** طلبات عميل — الأحدث أولًا + فلترة حالة + بحث برقم الطلب + ترتيب تاريخ */
export function getCustomerOrders(id, { status, search, sort, page, limit } = {}) {
  getCustomerRowById(id); // 404 عند عدم الوجود
  const db = getDb();
  const lim = Math.min(50, Math.max(1, Number(limit) || 10));
  const p = Math.max(1, Number(page) || 1);
  const conds = ["o.customer_id = ?"];
  const vals = [id];
  if (status) { conds.push("o.status = ?"); vals.push(String(status)); }
  if (search) { conds.push("o.order_number LIKE ?"); vals.push(`%${String(search).slice(0, 30)}%`); }
  const where = `WHERE ${conds.join(" AND ")}`;
  const order = sort === "oldest" ? "o.created_at ASC" : "o.created_at DESC";
  const rows = db
    .prepare(
      `SELECT o.order_number AS orderNumber, o.status, o.total,
              o.fulfillment_method AS fulfillmentMethod, o.created_at AS createdAt,
              (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS itemsCount
       FROM orders o ${where} ORDER BY ${order} LIMIT ? OFFSET ?;`
    )
    .all(...vals, lim, (p - 1) * lim);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders o ${where};`).get(...vals).n;
  return { orders: rows, total, limit: lim, page: p };
}

/** العميل الموقوف لا يمكنه إنشاء طلبات جديدة */
export function assertCustomerCanOrder(customer) {
  if (customer && customer.status === "blocked") {
    throw ApiError.badRequest("CUSTOMER_BLOCKED", "هذا الحساب موقوف — تواصل مع المحل.");
  }
}
