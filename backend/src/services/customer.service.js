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
