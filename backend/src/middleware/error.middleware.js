// ==========================================================================
// معالجة أخطاء موحدة: { success:false, error:{ code, message } }
// لا تُعرض Stack Traces أو تفاصيل حساسة للعميل أبدًا.
// ==========================================================================
import { env } from "../config/env.js";

export function notFound(req, res, _next) {
  res.status(404).json({
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: "المسار غير موجود." },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const code = err?.code || "INTERNAL_ERROR";
  const message = status === 500 ? "حدث خطأ غير متوقع — حاول مرة أخرى." : (err.message || "خطأ غير معروف.");
  if (env.isDev) console.error(`[error] ${req.method} ${req.path} →`, err);
  else console.error(`[error] ${req.method} ${req.path} → ${code}`);
  res.status(status).json({ success: false, error: { code, message } });
}
