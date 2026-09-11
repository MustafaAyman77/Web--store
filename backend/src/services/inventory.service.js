// ==========================================================================
// أسواق البسيط — Inventory Service (المخزون)
// --------------------------------------------------------------------------
// كل عمليات المخزون تمر من هنا داخل Transaction + حركة مسجلة — لا يوجد
// تعديل مخزون "صامت" في أي مكان آخر.
// أنواع الحركات: purchase | sale | manual_add | manual_remove | correction | cancel_restore
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb, transaction } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { logAudit } from "../utils/audit.js";
import { toPublicProduct } from "../controllers/products.controller.js";

import { stockStatusOf } from "../utils/product-status.js";

function insertMovement(db, { productId, type, quantity, previous, next, reason, admin }) {
  db.prepare(
    `INSERT INTO inventory_movements
     (id, product_id, type, quantity, previous_quantity, new_quantity, reason, admin_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`
  ).run(uuidv4(), productId, type, quantity, previous, next, reason || "", admin || "");
}

/**
 * تعديل مخزون منتج — mode: add | remove | set
 * يُستخدم من لوحة الإدارة. يسجل حركة + تدقيق. يمنع النزول تحت الصفر.
 */
export function adjustStock(productId, { mode, quantity, reason, admin } = {}) {
  const qty = Number(quantity);
  if (!["add", "remove", "set"].includes(mode)) {
    throw ApiError.badRequest("INVALID_MODE", "نوع العملية غير صحيح.");
  }
  if (!Number.isInteger(qty) || qty < 0) {
    throw ApiError.badRequest("INVALID_QUANTITY", "الكمية يجب أن تكون رقمًا صحيحًا ≥ صفر.");
  }
  if (mode !== "set" && qty < 1) {
    throw ApiError.badRequest("INVALID_QUANTITY", "الكمية يجب أن تكون 1 على الأقل.");
  }
  const cleanReason = String(reason ?? "").trim().slice(0, 200);

  return transaction((db) => {
    const row = db.prepare("SELECT * FROM products WHERE id = ?;").get(productId);
    if (!row) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
    if (Number(row.stock_tracking) !== 1) {
      throw ApiError.badRequest("TRACKING_DISABLED", "تتبع المخزون معطّل لهذا المنتج — فعّله من صفحة التعديل أولًا.");
    }
    const previous = Number(row.stock_quantity) || 0;
    const next = mode === "add" ? previous + qty : mode === "remove" ? previous - qty : qty;
    if (next < 0) {
      throw ApiError.badRequest("INSUFFICIENT_STOCK", "الكمية المطلوبة من هذا المنتج غير متاحة حاليًا");
    }
    db.prepare("UPDATE products SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?;")
      .run(next, productId);
    const type = mode === "add"
      ? (/استلام|بضاعة|شراء|توريد/.test(cleanReason) ? "purchase" : "manual_add")
      : mode === "remove" ? "manual_remove" : "correction";
    insertMovement(db, { productId, type, quantity: mode === "set" ? Math.abs(next - previous) : qty, previous, next, reason: cleanReason, admin });
    logAudit({
      actor: admin, action: "stock.adjust", entity: "product", entityId: productId,
      meta: { mode, from: previous, to: next, reason: cleanReason },
    });
    return {
      product: toPublicProduct(db.prepare("SELECT * FROM products WHERE id = ?;").get(productId)),
      previousQuantity: previous,
      newQuantity: next,
    };
  });
}

/** خصم مخزون سطور طلب — يُستدعى داخل Transaction إنشاء الطلب */
export function deductForOrder(db, lines, orderNumber) {
  const dec = db.prepare(
    "UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = datetime('now') WHERE id = ?;"
  );
  for (const l of lines) {
    const row = db.prepare("SELECT stock_quantity FROM products WHERE id = ?;").get(l.productId);
    const previous = Number(row.stock_quantity);
    dec.run(l.quantity, l.productId);
    insertMovement(db, {
      productId: l.productId, type: "sale", quantity: l.quantity,
      previous, next: previous - l.quantity, reason: `طلب ${orderNumber}`, admin: "",
    });
  }
}

/** إعادة مخزون طلب ملغي — مرة واحدة فقط (يتحقق المتصل من stock_restored) */
export function restoreForOrder(db, orderId, orderNumber, admin) {
  const items = db.prepare("SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ?;")
    .all(orderId);
  const inc = db.prepare(
    "UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = datetime('now') WHERE id = ?;"
  );
  let restored = 0;
  for (const it of items) {
    const row = db.prepare("SELECT stock_quantity, stock_tracking FROM products WHERE id = ?;")
      .get(it.productId);
    if (!row || Number(row.stock_tracking) !== 1) continue; // غير متتبع → لا شيء لإعادته
    const previous = Number(row.stock_quantity) || 0;
    inc.run(it.quantity, it.productId);
    insertMovement(db, {
      productId: it.productId, type: "cancel_restore", quantity: it.quantity,
      previous, next: previous + it.quantity, reason: `إلغاء طلب ${orderNumber}`, admin,
    });
    restored++;
  }
  db.prepare("UPDATE orders SET stock_restored = 1 WHERE id = ?;").run(orderId);
  return restored;
}

/* ================= قراءة ================= */

export function getInventorySummary() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) AS n FROM products;").get().n;
  const avail = db.prepare("SELECT COUNT(*) AS n FROM products WHERE available = 1;").get().n;
  const rows = db.prepare("SELECT * FROM products WHERE stock_tracking = 1;").all();
  const low = [];
  const out = [];
  for (const r of rows) {
    const st = stockStatusOf(r);
    if (st === "low_stock") low.push({ id: r.id, name: r.name, category: r.category, image: r.image, stock: Number(r.stock_quantity), threshold: Number(r.low_stock_threshold ?? 5), available: Number(r.available) === 1 });
    else if (st === "out_of_stock") out.push({ id: r.id, name: r.name, category: r.category, image: r.image, stock: Number(r.stock_quantity) || 0, available: Number(r.available) === 1 });
  }
  low.sort((a, b) => a.stock - b.stock);
  return {
    totalProducts: total,
    availableProducts: avail,
    trackedProducts: rows.length,
    lowStock: low,
    lowStockCount: low.length,
    outOfStock: out,
    outOfStockCount: out.length,
    restockCount: low.length + out.length,
  };
}

export function getInventoryProduct(productId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM products WHERE id = ?;").get(productId);
  if (!row) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
  const history = db.prepare(
    "SELECT id, type, quantity, previous_quantity AS previousQuantity, new_quantity AS newQuantity, reason, admin_username AS admin, created_at AS createdAt FROM inventory_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 10;"
  ).all(productId);
  return { product: toPublicProduct(row), history };
}

export function getInventoryHistory(productId, { page, limit } = {}) {
  const db = getDb();
  const exists = db.prepare("SELECT id, name FROM products WHERE id = ?;").get(productId);
  if (!exists) throw ApiError.notFound("PRODUCT_NOT_FOUND", "المنتج غير موجود.");
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const p = Math.max(1, Number(page) || 1);
  const rows = db.prepare(
    `SELECT id, type, quantity, previous_quantity AS previousQuantity, new_quantity AS newQuantity,
            reason, admin_username AS admin, created_at AS createdAt
     FROM inventory_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;`
  ).all(productId, lim, (p - 1) * lim);
  const total = db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE product_id = ?;").get(productId).n;
  return { product: exists, movements: rows, total, limit: lim, page: p };
}
