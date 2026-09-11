// ==========================================================================
// حالة المنتج/المخزون — دوال خالصة بدون اعتماديات (تُستخدم في كل مكان)
// ==========================================================================

/** حالة مخزون المنتج: in_stock | low_stock | out_of_stock | untracked */
export function stockStatusOf(row) {
  if (!row || Number(row.stock_tracking) !== 1) return "untracked";
  const qty = Number(row.stock_quantity);
  if (!Number.isFinite(qty) || qty <= 0) return "out_of_stock";
  if (qty <= Number(row.low_stock_threshold ?? 5)) return "low_stock";
  return "in_stock";
}

/** نسبة الخصم % — دالة موحدة */
export function discountPercent(price, oldPrice) {
  const p = Number(price);
  const o = oldPrice === null || oldPrice === undefined ? null : Number(oldPrice);
  if (o === null || !Number.isFinite(o) || o <= p || p < 0) return 0;
  return Math.round(((o - p) / o) * 100);
}

/** هل يمكن شراء المنتج؟ متاح + (بدون تتبع أو مخزون > صفر) */
export function isPurchasable(row) {
  if (!row || Number(row.available) !== 1) return false;
  if (Number(row.stock_tracking) !== 1) return true;
  return Number(row.stock_quantity) > 0;
}

/** هل المنتج جديد؟ أُضيف خلال NEW_PRODUCT_DAYS يومًا (توقيت القاهرة) */
export function isNewProduct(row, days) {
  if (!row || !row.created_at) return false;
  const d = typeof days === "number" && days > 0 ? days : 14;
  const created = new Date(String(row.created_at).replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < d * 24 * 3600 * 1000;
}

/** الحالة العامة للوحة الإدارة: active | inactive | out_of_stock */
export function adminStatusOf(row) {
  if (!row) return "inactive";
  if (Number(row.available) !== 1) return "inactive";
  if (Number(row.stock_tracking) === 1 && Number(row.stock_quantity) <= 0) return "out_of_stock";
  return "active";
}
