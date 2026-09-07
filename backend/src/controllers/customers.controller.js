// ==========================================================================
// Customers Controller — قراءة أساسية (تُستخدمها لوحة الإدارة مستقبلًا)
// ==========================================================================
import { getCustomerById, findCustomerByPhone } from "../services/order.service.js";
import { ApiError } from "../utils/api-error.js";

export function getById(req, res) {
  res.json({ success: true, data: getCustomerById(req.params.id) });
}

export function findByPhone(req, res) {
  const phone = String(req.query.phone || "").trim();
  if (!phone) throw ApiError.badRequest("PHONE_REQUIRED", "رقم الهاتف مطلوب للبحث.");
  const customer = findCustomerByPhone(phone);
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  res.json({ success: true, data: customer });
}
