// ==========================================================================
// Orders Controller — إنشاء الطلبات (للجميع) + تتبع الضيف (طلب + هاتف)
// 🛡️ لا يوجد أي مسار عام يكشف طلبًا برقمه فقط — التتبع يتطلب الهاتف المطابق.
// ==========================================================================
import { createOrder, trackOrder, quoteTotals } from "../services/order.service.js";

export async function create(req, res) {
  const result = await createOrder(req.body || {});
  res.status(201).json({ success: true, data: result });
}

export function quote(req, res) {
  res.json({ success: true, data: quoteTotals(req.body || {}) });
}

export function track(req, res) {
  const data = trackOrder({
    orderNumber: req.body?.orderNumber,
    phone: req.body?.phone,
  });
  res.json({ success: true, data });
}
