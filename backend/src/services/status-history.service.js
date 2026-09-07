// ==========================================================================
// أسواق البسيط — تاريخ حالات الطلب (Stage 10)
// يُسجَّل داخل نفس Transaction تغيير الحالة — لا حالة بدون تاريخ.
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";

/** تسجيل انتقال حالة — tx إجباري (جزء من Transaction المتصل) */
export function recordStatusChange(tx, { orderId, status, changedBy = "system" }) {
  const who = changedBy === "admin" ? "admin" : "system";
  // طلبات قديمة قبل النظام: سطر أساس 'new' بتاريخ إنشاء الطلب أولًا
  const existing = tx.prepare("SELECT COUNT(*) AS n FROM order_status_history WHERE order_id = ?;").get(orderId).n;
  if (existing === 0 && status !== "new") {
    const order = tx.prepare("SELECT created_at AS createdAt FROM orders WHERE id = ?;").get(orderId);
    tx.prepare(
      "INSERT INTO order_status_history (id, order_id, status, changed_by, created_at) VALUES (?, ?, 'new', 'system', ?);"
    ).run(uuidv4(), orderId, order ? order.createdAt : new Date().toISOString());
  }
  tx.prepare(
    "INSERT INTO order_status_history (id, order_id, status, changed_by) VALUES (?, ?, ?, ?);"
  ).run(uuidv4(), orderId, status, who);
}

/** تاريخ الطلب مرتبًا زمنيًا — يُجلب عند فتح التفاصيل فقط */
export function getStatusHistory(orderId) {
  const db = getDb();
  return db
    .prepare("SELECT status, created_at AS createdAt FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC;")
    .all(orderId);
}
