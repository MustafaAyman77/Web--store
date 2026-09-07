// ==========================================================================
// Rate Limiting خفيف داخل الذاكرة (مناسب للسيرفر المحلي — بدون مكتبات)
// - يُستخدم لمسارات الـOTP الحساسة (إرسال/تحقق) حسب IP والهاتف.
// - الحدود مريحة للمستخدم الطبيعي، وصارمة ضد الإساءة الآلية.
// ==========================================================================
import { ApiError } from "../utils/api-error.js";

const buckets = new Map(); // key → { count, resetAt }

function purge() {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/**
 * @param {{windowMs:number, max:number, key:(req)=>string, code:string, message:string}} opts
 */
export function createRateLimiter({ windowMs, max, key, code, message }) {
  return (req, _res, next) => {
    purge();
    const k = `${code}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      const err = ApiError.tooManyRequests(code, message);
      err.retryAfter = Math.ceil((b.resetAt - now) / 1000);
      return next(err);
    }
    return next();
  };
}

const ipOf = (req) => String(req.ip || req.socket?.remoteAddress || "unknown");
const phoneOf = (req) => String(req.body?.phone || "").replace(/[^0-9+]/g, "").slice(0, 20) || "none";

// إرسال OTP: 30/ساعة لكل IP (شبكات مشتركة) + 5/ساعة لكل هاتف (فوق مهلة الـ60 ثانية)
export const limitSendOtpIp = createRateLimiter({
  windowMs: 60 * 60 * 1000, max: 30, key: ipOf,
  code: "RATE_LIMITED", message: "طلبات كثيرة — حاول مرة أخرى لاحقًا.",
});
export const limitSendOtpPhone = createRateLimiter({
  windowMs: 60 * 60 * 1000, max: 5, key: (req) => `${ipOf(req)}:${phoneOf(req)}`,
  code: "RATE_LIMITED", message: "طلبات كثيرة لهذا الرقم — حاول مرة أخرى لاحقًا.",
});

// تحقق OTP: 30/ساعة لكل IP (المحاولات على الرمز نفسه محدودة بـ OTP_MAX_ATTEMPTS)
export const limitVerifyOtp = createRateLimiter({
  windowMs: 60 * 60 * 1000, max: 30, key: ipOf,
  code: "RATE_LIMITED", message: "محاولات كثيرة — حاول مرة أخرى لاحقًا.",
});
