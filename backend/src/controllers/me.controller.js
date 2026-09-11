// ==========================================================================
// Me Controller — حساب العميل نفسه (من الجلسة فقط)
// كل الدوال هنا خلف requireCustomer — req.customer هو مصدر الهوية الوحيد.
// ==========================================================================
import {
  toSafeCustomer, getCustomerOrders, getMyOrderDetails,
  updateMyProfile, deactivateAccount,
} from "../services/customer.service.js";
import { getCustomerStats } from "../services/customer-history.service.js";
import { revokeAllSessions } from "../services/customer-session.service.js";
import { buildSessionCookie } from "./auth.controller.js";

export function me(req, res) {
  const stats = getCustomerStats(req.customer.id);
  res.json({
    success: true,
    data: {
      ...toSafeCustomer(req.customer),
      totalOrders: stats.totalOrders,
      lastOrderAt: stats.lastOrderAt,
    },
  });
}

export function myOrders(req, res) {
  const { status, search, sort, page, limit } = req.query || {};
  res.json({
    success: true,
    data: getCustomerOrders(req.customer.id, {
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      sort: sort ? String(sort) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}

export function myOrder(req, res) {
  res.json({
    success: true,
    data: getMyOrderDetails(req.customer.id, req.params.orderNumber),
  });
}

export function updateProfile(req, res) {
  res.json({ success: true, data: { customer: updateMyProfile(req.customer.id, req.body || {}) } });
}

export function deactivate(req, res) {
  deactivateAccount(req.customer.id);
  revokeAllSessions(req.customer.id);
  res.setHeader("Set-Cookie", buildSessionCookie("", { clear: true }));
  res.json({ success: true, data: { deactivated: true } });
}
