// ==========================================================================
// Demo OTP Provider — للتطوير المحلي فقط ⛔
// --------------------------------------------------------------------------
// - يعمل فقط عندما: NODE_ENV != production و OTP_PROVIDER=demo
// - يُستخدم رمز ثابت لتسهيل التجربة — ممنوع في Production تمامًا.
// - الرمز نفسه لا يُعرض في أي API أو Frontend — يظهر في Development logs فقط.
// 🔮 في Production: يُستبدل تلقائيًا بمزود SMS حقيقي (sms.provider.js).
// ==========================================================================
import { env } from "../../../config/env.js";

const DEMO_CODE = "123456";

export function isDemoAllowed() {
  return env.isDev && env.auth.otpProvider === "demo";
}

export function generateDemoCode() {
  if (!isDemoAllowed()) {
    throw new Error("Demo OTP is not allowed in this environment.");
  }
  return DEMO_CODE;
}

/** إرسال وهمي — يُسجَّل في Development logs فقط، ولا شيء في Production */
export async function sendDemoCode(phone) {
  if (!isDemoAllowed()) {
    throw new Error("Demo OTP is not allowed in this environment.");
  }
  console.log(`[DEV-ONLY][OTP-DEMO] 📱 رمز التحقق التجريبي للرقم ${phone}: ${DEMO_CODE}`);
  return { sent: true, provider: "demo" };
}
