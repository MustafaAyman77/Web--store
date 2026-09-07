// ==========================================================================
// Customers Controller — قراءة أساسية (تُستخدمها لوحة الإدارة مستقبلًا)
// ==========================================================================
import { findCustomerByPhone, getPublicProfile, getCustomerOrders } from "../services/customer.service.js";
import { ApiError } from "../utils/api-error.js";

export function getById(req, res) {
  res.json({ success: true, data: getPublicProfile(req.params.id) });
}

export function findByPhone(req, res) {
  const phone = String(req.query.phone || "").trim();
  if (!phone) throw ApiError.badRequest("PHONE_REQUIRED", "رقم الهاتف مطلوب للبحث.");
  const customer = findCustomerByPhone(phone);
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  res.json({ success: true, data: getPublicProfile(customer.id) });
}

export function customerOrders(req, res) {
  const { status, search, sort, page, limit } = req.query || {};
  res.json({
    success: true,
    data: getCustomerOrders(req.params.id, {
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      sort: sort ? String(sort) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}
