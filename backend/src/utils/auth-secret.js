// ==========================================================================
// سر جلسات العملاء — من SESSION_SECRET في .env فقط (لا يدخل Git أبدًا).
// - في Development بدون SESSION_SECRET: سر مؤقت مع تحذير واضح.
// - في Production بدونه: رفض صريح — لا يعمل النظام بدون سر حقيقي.
// ==========================================================================
import crypto from "node:crypto";
import { env } from "../config/env.js";

let ephemeral = "";
let warned = false;

export function getSessionSecret() {
  if (env.auth.sessionSecret) return env.auth.sessionSecret;
  if (!env.isDev) {
    throw new Error("SESSION_SECRET is required in production.");
  }
  if (!ephemeral) ephemeral = crypto.randomBytes(32).toString("hex");
  if (!warned) {
    warned = true;
    console.warn("⚠️ [DEV] SESSION_SECRET غير مضبوط — يُستخدم سر مؤقت (الجلسات تُبطل عند إعادة التشغيل).");
  }
  return ephemeral;
}
