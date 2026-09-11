// ==========================================================================
// أسواق البسيط — جلسات العملاء (DB-backed sessions + HttpOnly Cookie)
// --------------------------------------------------------------------------
// - التوكن عشوائي 256-بت، ويُخزَّن Hash فقط (HMAC بالسر) — never النص.
// - تسجيل الخروج = حذف الجلسة → التوكن القديم ميت فورًا.
// ==========================================================================
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";
import { env } from "../config/env.js";
import { getSessionSecret } from "../utils/auth-secret.js";

export const SESSION_COOKIE = "basit_session";

export function hashToken(token) {
  return crypto.createHmac("sha256", getSessionSecret()).update(String(token)).digest("hex");
}

export function createCustomerSession(customerId) {
  const token = crypto.randomBytes(32).toString("hex");
  const db = getDb();
  db.prepare("DELETE FROM customer_sessions WHERE expires_at <= datetime('now');").run();
  db.prepare(
    "INSERT INTO customer_sessions (id, customer_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', ?));"
  ).run(uuidv4(), customerId, hashToken(token), `+${env.auth.sessionTtlHours} hours`);
  return token;
}

/** العميل صاحب الجلسة الصالحة — أو null (بدون رمي أخطاء) */
export function getSessionCustomer(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT c.* FROM customer_sessions s
         JOIN customers c ON c.id = s.customer_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now');`
      )
      .get(hashToken(token));
    return row || null;
  } catch {
    return null;
  }
}

export function revokeSession(token) {
  if (!token) return false;
  const db = getDb();
  const r = db.prepare("DELETE FROM customer_sessions WHERE token_hash = ?;").run(hashToken(token));
  return r.changes > 0;
}

export function revokeAllSessions(customerId) {
  const db = getDb();
  db.prepare("DELETE FROM customer_sessions WHERE customer_id = ?;").run(customerId);
}
