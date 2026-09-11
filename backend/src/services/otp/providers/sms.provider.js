// ==========================================================================
// SMS OTP Provider — واجهة جاهزة للربط لاحقًا بمزود SMS حقيقي 🔮
// --------------------------------------------------------------------------
// عند التعاقد مع مزود (مثلًا): تُملأ الدالة sendSmsCode فقط —
// دون أي تغيير في otp.service.js أو الـControllers أو الـFrontend.
// ==========================================================================
import { ApiError } from "../../../utils/api-error.js";

/**
 * @param {string} _phone رقم الهاتف المطبّع
 * @param {string} _code رمز التحقق (6 أرقام)
 */
export async function sendSmsCode(_phone, _code) {
  // لا يوجد مزود SMS مربوط حاليًا — تُفعَّل لاحقًا عبر env فقط.
  throw ApiError.internal("SMS_PROVIDER_NOT_CONFIGURED", "خدمة الرسائل غير مفعّلة حاليًا.");
}
