// ==========================================================================
// Admin Auth — أساس بسيط لمرحلة الـDemo المحلي
// الدخول عبر POST /api/admin/login يُصدر Token مؤقتًا (12 ساعة).
// 🔮 في Production: يُستبدل بـ JWT + Refresh Tokens دون تغيير الـRoutes.
// ==========================================================================
import { randomUUID } from "node:crypto";
import { ApiError } from "../utils/api-error.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token → { username, expiresAt }

export function createSession(username) {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function purgeExpired() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(token);
  }
}

export function requireAdmin(req, res, next) {
  purgeExpired();
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return next(ApiError.unauthorized());
  }
  req.admin = { username: session.username };
  return next();
}
