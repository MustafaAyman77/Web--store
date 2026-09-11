// ==========================================================================
// أسواق البسيط — Customer History Service (تحليل مشتريات العميل من الـDB)
// --------------------------------------------------------------------------
// كل التفضيلات تُحسب من الطلبات الفعلية (غير الملغاة) — لا إدخال يدوي.
// الإحصائيات متوافقة مع منطق الإيراد: الطلبات الملغاة مستبعدة من الإنفاق.
// ==========================================================================
import { getDb } from "../database/database.js";

export function getCustomerStats(customerId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS totalOrders,
              COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) AS totalSpent,
              MAX(created_at) AS lastOrderAt,
              MIN(created_at) AS firstOrderAt
       FROM orders WHERE customer_id = ?;`
    )
    .get(customerId);
  return {
    totalOrders: row.totalOrders || 0,
    totalSpent: row.totalSpent || 0,
    lastOrderAt: row.lastOrderAt || null,
    firstOrderAt: row.firstOrderAt || null,
  };
}

/**
 * تاريخ المشتريات: المنتجات (مرات/آخر شراء) + الأقسام المفضلة + أزواج متكررة.
 * يُستخدم داخليًا للتوصيات ولوحة الإدارة فقط — لا يُعرض للعامة.
 */
export function getPurchaseHistory(customerId) {
  const db = getDb();

  const products = db
    .prepare(
      `SELECT oi.product_id AS productId, oi.product_name AS name,
              p.image AS image, p.category AS category,
              COUNT(*) AS times, SUM(oi.quantity) AS totalQty,
              MAX(o.created_at) AS lastBoughtAt
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.customer_id = ? AND o.status != 'cancelled'
       GROUP BY oi.product_id
       ORDER BY times DESC, lastBoughtAt DESC
       LIMIT 50;`
    )
    .all(customerId);

  const favoriteCategories = db
    .prepare(
      `SELECT p.category AS category, SUM(oi.quantity) AS qty, COUNT(*) AS lines
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.customer_id = ? AND o.status != 'cancelled' AND p.category IS NOT NULL
       GROUP BY p.category
       ORDER BY qty DESC
       LIMIT 5;`
    )
    .all(customerId);

  // أزواج يشتريها العميل معًا في نفس الطلب (مرتين على الأقل)
  const frequentPairs = db
    .prepare(
      `SELECT a.product_id AS a, b.product_id AS b, COUNT(*) AS count
       FROM order_items a
       JOIN order_items b ON b.order_id = a.order_id AND b.product_id > a.product_id
       JOIN orders o ON o.id = a.order_id
       WHERE o.customer_id = ? AND o.status != 'cancelled'
       GROUP BY a.product_id, b.product_id
       HAVING COUNT(*) >= 2
       ORDER BY count DESC
       LIMIT 10;`
    )
    .all(customerId);

  return { products, favoriteCategories, frequentPairs };
}
