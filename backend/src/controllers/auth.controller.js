// ==========================================================================
// Auth Controller — دخول العملاء عبر OTP (بدون Password)
// الجلسة في HttpOnly Cookie — لا يوجد أي توكن في localStorage أو الـResponses.
// ==========================================================================
import { env } from "../config/env.js";
import { requestOtp, verifyOtp } from "../services/otp/otp.service.js";
import { SESSION_COOKIE, revokeSession } from "../services/customer-session.service.js";
import { readSessionToken } from "../middleware/customer-auth.middleware.js";

export function buildSessionCookie(token, { clear = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (!env.isDev) parts.push("Secure"); // HTTPS فقط في Production
  parts.push(clear ? "Max-Age=0" : `Max-Age=${env.auth.sessionTtlHours * 3600}`);
  return parts.join("; ");
}

export async function sendOtp(req, res) {
  const data = await requestOtp({ phone: req.body?.phone });
  res.json({ success: true, data });
}

export async function verifyOtpCode(req, res) {
  const { customer, token } = await verifyOtp({
    phone: req.body?.phone,
    code: req.body?.code,
    name: req.body?.name,
  });
  res.setHeader("Set-Cookie", buildSessionCookie(token));
  res.json({ success: true, data: { customer } });
}

export function logout(req, res) {
  revokeSession(readSessionToken(req));
  res.setHeader("Set-Cookie", buildSessionCookie("", { clear: true }));
  res.json({ success: true, data: { loggedOut: true } });
}
