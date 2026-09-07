// ==========================================================================
// Admin Controller — الدخول + إدارة الطلبات (محمي بـ requireAdmin)
// ⚠️ لا يُعرض password_hash عبر أي API أبدًا.
// ==========================================================================
import bcrypt from "bcryptjs";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { createSession } from "../middleware/auth.middleware.js";
import { listOrders, updateOrderStatus, ORDER_STATUSES } from "../services/order.service.js";
import { testTelegramConnection, retryTelegramNotification } from "../services/telegram.service.js";

export async function login(req, res) {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) throw ApiError.badRequest("CREDENTIALS_REQUIRED", "اسم المستخدم وكلمة المرور مطلوبان.");

  const db = getDb();
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?;").get(username);
  // مقارنة ثابتة الشكل حتى مع عدم وجود المستخدم (ضد التخمين بالتوقيت)
  const hash = admin ? admin.password_hash : "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!admin || !ok) throw ApiError.unauthorized("بيانات الدخول غير صحيحة.");

  const token = createSession(admin.username);
  res.json({ success: true, data: { token, username: admin.username, expiresInHours: 12 } });
}

export function orders(req, res) {
  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !ORDER_STATUSES.includes(status)) {
    throw ApiError.badRequest("INVALID_STATUS", "حالة الطلب غير صحيحة.");
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  res.json({ success: true, data: listOrders({ status, limit, offset }) });
}

export function setOrderStatus(req, res) {
  const result = updateOrderStatus(req.params.ref, String(req.body?.status || ""));
  res.json({ success: true, data: result });
}

export async function telegramTest(req, res) {
  const result = await testTelegramConnection();
  res.json({ success: true, data: result });
}

export async function telegramRetry(req, res) {
  const force = req.body?.force === true;
  const result = await retryTelegramNotification(req.params.ref, { force });
  res.json({ success: true, data: result });
}
