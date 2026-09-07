// ==========================================================================
// أسواق البسيط — Telegram Service (بنية جاهزة — المرحلة 5)
// --------------------------------------------------------------------------
// الواجهة المستقرة: sendOrderNotification(order)
// حاليًا: TELEGRAM_ENABLED=false → لا يُرسل أي شيء، مجرد سجل.
// في المرحلة 5: يُضاف الإرسال الحقيقي هنا فقط (باستخدام env.telegram).
// ⚠️ لا يُوضع Bot Token إطلاقًا في أي مكان آخر — فقط في ملف .env
// ==========================================================================
import { env } from "../config/env.js";

export async function sendOrderNotification(order) {
  if (!env.telegram.enabled) {
    console.log(`[Telegram] Disabled in development mode — order ${order?.orderNumber} logged only.`);
    return { sent: false, reason: "disabled" };
  }
  // --- التنفيذ الحقيقي في المرحلة 5 (Prompt 5) ---
  if (!env.telegram.botToken || !env.telegram.chatId) {
    console.warn("[Telegram] Enabled but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are missing.");
    return { sent: false, reason: "not-configured" };
  }
  console.warn("[Telegram] Real sending will be implemented in Prompt 5.");
  return { sent: false, reason: "not-implemented" };
}

export default { sendOrderNotification };
