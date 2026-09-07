// ==========================================================================
// Orders Controller — إنشاء الطلبات واسترجاعها (العميل كـ Guest)
// ==========================================================================
import { createOrder, getOrderByIdOrNumber } from "../services/order.service.js";

export async function create(req, res) {
  const result = await createOrder(req.body || {});
  res.status(201).json({ success: true, data: result });
}

export function getById(req, res) {
  const order = getOrderByIdOrNumber(req.params.ref);
  res.json({ success: true, data: order });
}
