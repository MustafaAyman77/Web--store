// ==========================================================================
// أسواق البسيط — OTP Service (طلب رمز + تحقق)
// --------------------------------------------------------------------------
// - يُخزَّن Hash الرمز فقط (HMAC) — never نص صريح في DB أو logs.
// - انتهاء + حد محاولات + مهلة إعادة إرسال — كلها من Environment.
// - المزود قابل للتبديل (demo الآن / SMS حقيقي لاحقًا) دون تغيير هذا الملف.
// ==========================================================================
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../database/database.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { validateEgyptianPhone } from "../../utils/phone.js";
import { getSessionSecret } from "../../utils/auth-secret.js";
import { findCustomerByPhone, toSafeCustomer } from "../customer.service.js";
import { createCustomerSession } from "../customer-session.service.js";
import { isDemoAllowed, generateDemoCode, sendDemoCode } from "./providers/demo.provider.js";
import { sendSmsCode } from "./providers/sms.provider.js";

function hashCode(code) {
  return crypto.createHmac("sha256", getSessionSecret()).update(String(code)).digest("hex");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function purgeExpired(db) {
  db.prepare("DELETE FROM otp_codes WHERE expires_at <= datetime('now');").run();
}

function utcMs(sqliteTs) {
  return new Date(String(sqliteTs).replace(" ", "T") + "Z").getTime();
}

/* ================= طلب رمز ================= */

export async function requestOtp({ phone: rawPhone }) {
  if (!env.auth.enabled) {
    throw ApiError.forbidden("AUTH_DISABLED", "تسجيل الدخول غير متاح حاليًا.");
  }
  const phone = validateEgyptianPhone(rawPhone);
  if (!phone) throw ApiError.badRequest("INVALID_PHONE", "من فضلك أدخل رقم هاتف مصري صحيح.");
  const db = getDb();
  const existing = findCustomerByPhone(phone);
  if (existing && existing.status === "blocked") {
    throw ApiError.forbidden("CUSTOMER_BLOCKED", "هذا الحساب موقوف — تواصل مع المحل.");
  }
  purgeExpired(db);
  // مهلة إعادة الإرسال — تُحسب من آخر رمز معلّق
  const last = db
    .prepare("SELECT created_at AS createdAt FROM otp_codes WHERE phone = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1;")
    .get(phone);
  if (last) {
    const elapsed = (Date.now() - utcMs(last.createdAt)) / 1000;
    const cooldown = env.auth.otpResendCooldownSeconds;
    if (elapsed < cooldown) {
      const err = ApiError.tooManyRequests("OTP_COOLDOWN", `انتظر ${Math.ceil(cooldown - elapsed)} ثانية قبل طلب رمز جديد.`);
      err.retryAfter = Math.ceil(cooldown - elapsed);
      throw err;
    }
    db.prepare("DELETE FROM otp_codes WHERE phone = ? AND verified_at IS NULL;").run(phone);
  }

  const demo = isDemoAllowed();
  const code = demo ? generateDemoCode() : String(crypto.randomInt(100000, 1000000));
  db.prepare(
    "INSERT INTO otp_codes (id, customer_id, phone, code_hash, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?));"
  ).run(uuidv4(), existing ? existing.id : null, phone, hashCode(code), `+${env.auth.otpExpirationMinutes} minutes`);

  if (demo) {
    await sendDemoCode(phone); // Development logs فقط
  } else {
    await sendSmsCode(phone, code); // 🔮 مزود حقيقي لاحقًا
  }
  return {
    phone,
    expiresInMinutes: env.auth.otpExpirationMinutes,
    cooldownSeconds: env.auth.otpResendCooldownSeconds,
  };
}

/* ================= التحقق + إنشاء الجلسة ================= */

export async function verifyOtp({ phone: rawPhone, code: rawCode, name }) {
  if (!env.auth.enabled) {
    throw ApiError.forbidden("AUTH_DISABLED", "تسجيل الدخول غير متاح حاليًا.");
  }
  const phone = validateEgyptianPhone(rawPhone);
  if (!phone) throw ApiError.badRequest("INVALID_PHONE", "من فضلك أدخل رقم هاتف مصري صحيح.");
  const code = String(rawCode ?? "").replace(/[^0-9]/g, "").slice(0, 10);
  if (!code) throw ApiError.badRequest("OTP_REQUIRED", "من فضلك أدخل رمز التحقق.");
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM otp_codes WHERE phone = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1;")
    .get(phone);
  if (!row) throw ApiError.badRequest("OTP_INVALID", "رمز التحقق غير صحيح أو انتهت صلاحيته.");
  if (utcMs(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM otp_codes WHERE id = ?;").run(row.id);
    throw ApiError.badRequest("OTP_EXPIRED", "انتهت صلاحية الرمز — اطلب رمزًا جديدًا.");
  }
  const maxed = () => {
    db.prepare("DELETE FROM otp_codes WHERE id = ?;").run(row.id);
    throw ApiError.tooManyRequests("OTP_MAX_ATTEMPTS", "تجاوزت عدد المحاولات — اطلب رمزًا جديدًا.");
  };
  if (row.attempts >= env.auth.otpMaxAttempts) maxed();
  if (!safeEqual(hashCode(code), row.code_hash)) {
    const attempts = row.attempts + 1;
    if (attempts >= env.auth.otpMaxAttempts) maxed();
    db.prepare("UPDATE otp_codes SET attempts = ? WHERE id = ?;").run(attempts, row.id);
    throw ApiError.badRequest("OTP_INVALID", "رمز التحقق غير صحيح.");
  }

  // نجاح ✅ — تعليم الرمز + إلغاء أي رموز أخرى + تفعيل الحساب على نفس العميل
  db.prepare("UPDATE otp_codes SET verified_at = datetime('now') WHERE id = ?;").run(row.id);
  db.prepare("DELETE FROM otp_codes WHERE phone = ? AND id != ?;").run(phone, row.id);

  let customer = findCustomerByPhone(phone);
  if (customer && customer.status === "blocked") {
    throw ApiError.forbidden("CUSTOMER_BLOCKED", "هذا الحساب موقوف — تواصل مع المحل.");
  }
  if (!customer) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    if (cleanName.length < 3) {
      throw ApiError.badRequest("INVALID_NAME", "من فضلك أدخل اسمك بالكامل.");
    }
    customer = { id: uuidv4(), name: cleanName, phone };
    db.prepare(
      "INSERT INTO customers (id, name, phone, account_enabled, phone_verified, last_login_at) VALUES (?, ?, ?, 1, 1, datetime('now'));"
    ).run(customer.id, customer.name, customer.phone);
  } else {
    db.prepare(
      "UPDATE customers SET account_enabled = 1, phone_verified = 1, last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?;"
    ).run(customer.id);
  }
  const token = createCustomerSession(customer.id);
  return { customer: toSafeCustomer(findCustomerByPhone(phone)), token };
}
