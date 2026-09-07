// ==========================================================================
// توليد رقم طلب للعميل بصيغة BS-YYYYMMDD-NNNN (متسلسل يوميًا + فريد)
// يُستدعى داخل Transaction إنشاء الطلب لمنع التكرار.
// ==========================================================================

const pad = (n, len = 2) => String(n).padStart(len, "0");

export function generateOrderNumber(db) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const prefix = `BS-${stamp}-`;
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM orders WHERE order_number LIKE ?;")
    .get(prefix + "%");
  const seq = (row?.count ?? 0) + 1;
  return prefix + pad(seq, 4);
}
