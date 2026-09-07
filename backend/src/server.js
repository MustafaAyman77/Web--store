// ==========================================================================
// أسواق البسيط — نقطة تشغيل السيرفر (npm start / npm run dev)
// ==========================================================================
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { getDb, closeDb } from "./database/database.js";

const app = createApp();

// التأكد من جاهزية قاعدة البيانات عند الإقلاع
getDb();

const server = app.listen(env.port, () => {
  console.log(`🛒 أسواق البسيط — Backend يعمل الآن`);
  console.log(`   → الموقع:  http://localhost:${env.port}`);
  console.log(`   → الصحة:   http://localhost:${env.port}/api/health`);
  console.log(`   → البيئة:  ${env.nodeEnv} | التوصيل: ${env.delivery.enabled ? "مفعّل" : "معطّل"} | Telegram: ${env.telegram.enabled ? "مفعّل" : "معطّل"}`);
  if (env.isDev && env.auth.enabled && env.auth.otpProvider === "demo") {
    console.log(`   ⚠️  Demo Authentication مفعّلة (OTP تجريبي في logs التطوير فقط) — ليست مصادقة Production.`);
  }
});

function shutdown(signal) {
  console.log(`\n[${signal}] إيقاف السيرفر...`);
  server.close(() => {
    closeDb();
    console.log("[shutdown] ✅ تم الإيقاف بنجاح.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
