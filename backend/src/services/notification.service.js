// ==========================================================================
// أسواق البسيط — إشعارات العملاء الداخلية (Stage 10)
// --------------------------------------------------------------------------
// - إشعارات داخلية من الـBackend فقط — لا SMS ولا Push ولا خدمات خارجية.
// - منع التكرار: UNIQUE(customer_id, order_id, type) — يُتجاهل المكرر بهدوء.
// - كل الدوال المكتوبة تستقبل tx (جزء من Transaction المتصل).
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

const TYPE_BY_STATUS = {
  new: "order_created",
  confirmed: "order_confirmed",
  preparing: "order_preparing",
  ready: "order_ready",
  out_for_delivery: "order_out_for_delivery",
  completed: "order_completed",
  cancelled: "order_cancelled",
};

function template(status, orderNumber, fulfillmentMethod) {
  const pickup = fulfillmentMethod === "pickup";
  switch (status) {
    case "new":
      return ["تم استلام طلبك 🎉", `رقم طلبك ${orderNumber} — تابع حالته من صفحة تتبع الطلب.`];
    case "confirmed":
      return ["تم تأكيد طلبك ✅", `تم تأكيد طلبك ${orderNumber} وبدأنا في تجهيزه.`];
    case "preparing":
      return ["جاري تجهيز طلبك 🛒", `طلبك ${orderNumber} قيد التجهيز الآن.`];
    case "ready":
      return pickup
        ? ["طلبك جاهز 👍", `طلبك ${orderNumber} جاهز للاستلام من المحل.`]
        : ["طلبك جاهز 👍", `طلبك ${orderNumber} جاهز وهيخرج للتوصيل.`];
    case "out_for_delivery":
      return ["طلبك في الطريق 🚗", `طلبك ${orderNumber} في الطريق إليك.`];
    case "completed":
      return ["تم تسليم طلبك ❤️", "شكرًا لاختيارك أسواق البسيط."];
    case "cancelled":
      return ["تم إلغاء طلبك", `تم إلغاء الطلب ${orderNumber}. لو محتاج مساعدة تواصل مع المحل.`];
    default:
      return ["تحديث طلبك 🔔", `طلبك ${orderNumber} — حالة جديدة.`];
  }
}

/** إنشاء إشعار حالة — idempotent (المكرر يُتجاهل). tx إجباري. */
export function createStatusNotification(tx, { customerId, orderId, orderNumber, status, fulfillmentMethod }) {
  if (!env.notifications.enabled) return null;
  const type = TYPE_BY_STATUS[status];
  if (!type || !customerId || !orderId) return null;
  const [title, message] = template(status, orderNumber, fulfillmentMethod);
  try {
    tx.prepare(
      "INSERT INTO notifications (id, customer_id, order_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?);"
    ).run(uuidv4(), customerId, orderId, type, title, message);
    return type;
  } catch (err) {
    // UNIQUE violation = إشعار مكرر → تجاهل بهدوء (idempotency)
    if (err && /UNIQUE/i.test(String(err.message))) return null;
    throw err;
  }
}

/* ================= قراءة العميل (من الجلسة فقط) ================= */

export function listNotifications(customerId, { page, limit } = {}) {
  const db = getDb();
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const p = Math.max(1, Number(page) || 1);
  const rows = db
    .prepare(
      `SELECT n.id, n.type, n.title, n.message, n.is_read AS isRead, n.created_at AS createdAt,
              o.order_number AS orderNumber
       FROM notifications n LEFT JOIN orders o ON o.id = n.order_id
       WHERE n.customer_id = ? ORDER BY n.created_at DESC, n.rowid DESC LIMIT ? OFFSET ?;`
    )
    .all(customerId, lim, (p - 1) * lim);
  const total = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE customer_id = ?;").get(customerId).n;
  return {
    notifications: rows.map((r) => ({ ...r, isRead: Number(r.isRead) === 1 })),
    total, limit: lim, page: p,
  };
}

export function unreadCount(customerId) {
  const db = getDb();
  return db
    .prepare("SELECT COUNT(*) AS n FROM notifications WHERE customer_id = ? AND is_read = 0;")
    .get(customerId).n;
}

export function markRead(customerId, id) {
  const db = getDb();
  const r = db
    .prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ? AND is_read = 0;")
    .run(id, customerId);
  if (r.changes === 0) {
    const exists = db.prepare("SELECT id FROM notifications WHERE id = ?;").get(id);
    if (!exists) throw ApiError.notFound("NOTIFICATION_NOT_FOUND", "الإشعار غير موجود.");
    // موجود لكن لعميل آخر، أو مقروء بالفعل → نُعامل الغريب كغير موجود
    const mine = db.prepare("SELECT id FROM notifications WHERE id = ? AND customer_id = ?;").get(id, customerId);
    if (!mine) throw ApiError.notFound("NOTIFICATION_NOT_FOUND", "الإشعار غير موجود.");
  }
  return { id, isRead: true };
}

export function markAllRead(customerId) {
  const db = getDb();
  const r = db.prepare("UPDATE notifications SET is_read = 1 WHERE customer_id = ? AND is_read = 0;").run(customerId);
  return { updated: r.changes };
}
