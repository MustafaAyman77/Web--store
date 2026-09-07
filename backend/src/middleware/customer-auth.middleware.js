// ==========================================================================
// Customer Auth Middleware — جلسة العميل من HttpOnly Cookie (بدون localStorage)
// - attachCustomer: اختياري — يملأ req.customer عند وجود جلسة صالحة فقط.
// - requireCustomer: إجباري — 401 بدون جلسة، 403 للحساب الموقوف.
// ==========================================================================
import { ApiError } from "../utils/api-error.js";
import { SESSION_COOKIE, getSessionCustomer } from "../services/customer-session.service.js";

export function readSessionToken(req) {
  const header = String(req.headers.cookie || "");
  if (!header) return "";
  const parts = header.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    if (p.slice(0, idx).trim() === SESSION_COOKIE) {
      return decodeURIComponent(p.slice(idx + 1).trim());
    }
  }
  return "";
}

/** إرفاق اختياري — لا يرمي أخطاء أبدًا (للضيوف + التوصيات) */
export function attachCustomer(req, _res, next) {
  try {
    req.customer = getSessionCustomer(readSessionToken(req)) || null;
  } catch {
    req.customer = null;
  }
  next();
}

/** حماية routes الحساب — العميل من الجلسة فقط، never من الـFrontend */
export function requireCustomer(req, _res, next) {
  const customer = req.customer || getSessionCustomer(readSessionToken(req));
  if (!customer) {
    return next(ApiError.unauthorized("سجّل الدخول أولًا لعرض حسابك."));
  }
  if (customer.status === "blocked") {
    return next(ApiError.forbidden("CUSTOMER_BLOCKED", "هذا الحساب موقوف — تواصل مع المحل."));
  }
  req.customer = customer;
  return next();
}
