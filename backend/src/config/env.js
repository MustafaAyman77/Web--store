// ==========================================================================
// أسواق البسيط — Environment configuration
// كل إعدادات السيرفر من مكان واحد. لا توجد قيم ثابتة لـ localhost أو أسرار
// داخل الكود — كل شيء عبر Environment Variables.
// ==========================================================================
import dotenv from "dotenv";

dotenv.config();

const toBool = (v, fallback) => {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};

const toInt = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") !== "production",

  databasePath: process.env.DATABASE_PATH || "./data/basit-market.db",
  allowedOrigins: String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  admin: {
    username: process.env.ADMIN_USERNAME || "admin",
    // تُستخدم فقط عند التزويد الأولي (seed) ثم تُخزَّن مشفَّرة
    password: process.env.ADMIN_PASSWORD || "CHANGE_ME",
  },

  delivery: {
    enabled: toBool(process.env.DELIVERY_ENABLED, true),
    fee: Math.max(0, Number(process.env.DELIVERY_FEE) || 0),
  },

  telegram: {
    enabled: toBool(process.env.TELEGRAM_ENABLED, false),
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    timeoutMs: toInt(process.env.TELEGRAM_TIMEOUT_MS, 10000),
  },

  recommendations: {
    newProductDays: Math.max(1, toInt(process.env.NEW_PRODUCT_DAYS, 14)),
    minCoOccurrences: Math.max(1, toInt(process.env.RECOMMENDATION_MIN_CO_OCCURRENCES, 3)),
  },
};

export default env;
