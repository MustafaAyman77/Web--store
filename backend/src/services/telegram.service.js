// ==========================================================================
// أسواق البسيط — Telegram Service (المرحلة 5)
// --------------------------------------------------------------------------
// قناة إشعارات داخلية لصاحب المحل فقط — العميل لا يراها إطلاقًا.
// الواجهة: sendMessage / sendOrderNotification / sendOrderStatusUpdate
//          / retryTelegramNotification / testTelegramConnection
// --------------------------------------------------------------------------
// القواعد:
// - الإرسال من الـ Backend فقط (Bot API) — لا شيء من المتصفح.
// - حفظ الطلب لا يعتمد على نجاح Telegram إطلاقًا.
// - منع التكرار: status = sent → لا إعادة إرسال إلا بـ force صريح.
// - لا يُطبع الـ Token في أي Log، ولا يُعرض في أي Response.
// 🔮 جاهز لترقية لاحقة إلى Queue دون تغيير الواجهة.
// ==========================================================================
import { env } from "../config/env.js";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";

const DIV = "━━━━━━━━━━━━━━━━━━";
const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const STATUS_AR = {
  new: "جديد 🆕",
  confirmed: "مؤكد ✅",
  preparing: "قيد التجهيز 👨‍🍳",
  ready: "جاهز للاستلام ✅",
  out_for_delivery: "خارج للتوصيل 🛵",
  completed: "مكتمل ✔️",
  cancelled: "ملغي ❌",
};

const FULFILL_AR = {
  delivery: "🚚 توصيل للمنزل",
  pickup: "🏪 استلام من المحل",
};

/* ================= أدوات ================= */

/** Escape لمحتوى المستخدم قبل وضعه في رسالة HTML */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** توقيت القاهرة بصيغة YYYY-MM-DD HH:MM (التخزين UTC) */
function formatCairo(sqliteUtc) {
  try {
    const d = new Date(String(sqliteUtc).replace(" ", "T") + "Z");
    if (isNaN(d)) return String(sqliteUtc || "");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return String(sqliteUtc || "");
  }
}

/** استدعاء Bot API بمهلة زمنية — لا يرمي استثناءً أبدًا */
async function callTelegram(method, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.telegram.timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    return {
      httpStatus: res.status,
      ok: !!(data && data.ok),
      data,
    };
  } catch (err) {
    clearTimeout(timer);
    const timeout = err && err.name === "AbortError";
    return {
      httpStatus: 0,
      ok: false,
      timeout,
      error: timeout ? "timeout" : String((err && err.message) || err),
    };
  }
}

/* ================= الإرسال الخام ================= */

export async function sendMessage(text) {
  if (!env.telegram.enabled) return { sent: false, reason: "disabled" };
  if (!env.telegram.botToken || !env.telegram.chatId) {
    return { sent: false, reason: "not-configured" };
  }
  const r = await callTelegram("sendMessage", {
    chat_id: env.telegram.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  if (r.ok) {
    return { sent: true, messageId: r.data?.result?.message_id ?? null };
  }
  return {
    sent: false,
    reason: r.timeout ? "timeout" : "api-error",
    httpStatus: r.httpStatus,
    description: (r.data && r.data.description) || r.error || "unknown",
    timeout: !!r.timeout,
  };
}

/* ================= بناء رسالة الطلب (من الـDB فقط) ================= */

function findOrderRow(db, ref) {
  return db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?;").get(ref, ref) || null;
}

function getDetails(db, order) {
  const customer = db
    .prepare("SELECT name, phone, address, area, landmark FROM customers WHERE id = ?;")
    .get(order.customer_id) || {};
  const items = db
    .prepare("SELECT product_name AS name, quantity, price, subtotal, original_price AS originalPrice, discount_amount AS discountAmount, promotion_name AS promotionName FROM order_items WHERE order_id = ?;")
    .all(order.id);
  return { order, customer, items };
}

function buildOrderMessage({ order, customer, items }) {
  const lines = [];
  lines.push("🛒 <b>طلب جديد — أسواق البسيط</b>");
  lines.push("");
  lines.push(DIV);
  lines.push("");
  lines.push(`🔢 <b>رقم الطلب:</b>\n${escapeHtml(order.order_number)}`);
  lines.push("");
  lines.push(`👤 <b>العميل:</b>\n${escapeHtml(customer.name)}`);
  lines.push("");
  lines.push(`📞 <b>الهاتف:</b>\n${escapeHtml(customer.phone)}`);
  if (order.fulfillment_method === "delivery") {
    lines.push("");
    lines.push(`📍 <b>العنوان:</b>\n${escapeHtml(customer.address || "—")}`);
    if (customer.area) {
      lines.push("");
      lines.push(`🏘️ <b>المنطقة:</b>\n${escapeHtml(customer.area)}`);
    }
    if (customer.landmark) {
      lines.push("");
      lines.push(`📌 <b>علامة مميزة:</b>\n${escapeHtml(customer.landmark)}`);
    }
  }
  lines.push("");
  lines.push(DIV);
  lines.push("");
  lines.push("🛍️ <b>المنتجات:</b>");
  lines.push("");
  items.forEach((it, i) => {
    const num = NUM_EMOJI[i] || `${i + 1}.`;
    lines.push(`${num} <b>${escapeHtml(it.name)}</b>`);
    lines.push(`الكمية: ${it.quantity}`);
    if (it.originalPrice && Number(it.originalPrice) > Number(it.price)) {
      lines.push(`السعر: ${it.originalPrice} ← <b>${it.price} جنيه (عرض)</b>`);
    } else {
      lines.push(`السعر: ${it.price} جنيه`);
    }
    lines.push(`الإجمالي: ${it.subtotal} جنيه`);
    lines.push("");
  });
  lines.push(DIV);
  lines.push("");
  const origTotal = items.reduce((sum, it) => sum + (Number(it.originalPrice) || Number(it.price)) * Number(it.quantity), 0);
  const discountTotal = Math.round((origTotal - Number(order.subtotal)) * 100) / 100;
  if (discountTotal > 0) {
    lines.push(`🧾 <b>إجمالي قبل الخصم:</b>\n${origTotal} جنيه`);
    lines.push("");
    lines.push(`🎉 <b>الخصم:</b>\n${discountTotal} جنيه`);
    lines.push("");
  }
  lines.push(`💰 <b>المجموع الفرعي:</b>\n${order.subtotal} جنيه`);
  lines.push("");
  lines.push(`🚚 <b>التوصيل:</b>\n${order.delivery_fee === null ? "غير محدد" : order.delivery_fee + " جنيه"}`);
  lines.push("");
  lines.push(`💵 <b>الإجمالي:</b>\n${order.total} جنيه`);
  lines.push("");
  lines.push(`📦 <b>طريقة الاستلام:</b>\n${FULFILL_AR[order.fulfillment_method] || order.fulfillment_method}`);
  if (order.fulfillment_method === "delivery" && order.delivery_zone_name) {
    lines.push("");
    lines.push(`🗺️ <b>منطقة التوصيل:</b>\n${escapeHtml(order.delivery_zone_name)}`);
  }
  if (order.notes) {
    lines.push("");
    lines.push(`📝 <b>ملاحظات:</b>\n${escapeHtml(order.notes)}`);
  }
  lines.push("");
  lines.push(DIV);
  lines.push("");
  lines.push(`🕐 <b>وقت الطلب:</b>\n${formatCairo(order.created_at)}`);
  lines.push("");
  lines.push(`📊 <b>الحالة:</b>\n${STATUS_AR[order.status] || order.status}`);
  return lines.join("\n");
}

/* ================= إشعار طلب جديد (مع منع التكرار) ================= */

function setTgStatus(db, id, status, extra = {}) {
  db.prepare(
    `UPDATE orders SET telegram_status = ?,
      telegram_message_id = COALESCE(?, telegram_message_id),
      telegram_sent_at = COALESCE(?, telegram_sent_at),
      telegram_error = ?
     WHERE id = ?;`
  ).run(status, extra.messageId ?? null, extra.sentAt ?? null, extra.error ?? null, id);
}

export async function sendOrderNotification(ref, { force = false } = {}) {
  const db = getDb();
  const order = findOrderRow(db, ref);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", "الطلب غير موجود.");

  if (!env.telegram.enabled) {
    setTgStatus(db, order.id, "disabled");
    console.log(`[Telegram] Disabled — order ${order.order_number} logged only.`);
    return { sent: false, reason: "disabled", telegramStatus: "disabled" };
  }
  if (!env.telegram.botToken || !env.telegram.chatId) {
    setTgStatus(db, order.id, "failed", { error: "not-configured: missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID" });
    return { sent: false, reason: "not-configured", telegramStatus: "failed" };
  }
  if (order.telegram_status === "sent" && !force) {
    return { sent: false, reason: "already-sent", telegramStatus: "sent" };
  }

  setTgStatus(db, order.id, "sending");
  const text = buildOrderMessage(getDetails(db, order));
  const r = await sendMessage(text);

  if (r.sent) {
    setTgStatus(db, order.id, "sent", {
      messageId: r.messageId ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, messageId: r.messageId ?? null, telegramStatus: "sent" };
  }

  const errStr = `http=${r.httpStatus} timeout=${r.timeout ? 1 : 0} desc=${String(r.description || "unknown").slice(0, 300)}`;
  setTgStatus(db, order.id, "failed", { error: errStr });
  // سجل تشخيصي بدون أي أسرار (لا Token ولا Chat ID)
  console.error(`[telegram] order=${order.order_number} http=${r.httpStatus} desc=${r.description || r.reason} at=${new Date().toISOString()}`);
  return {
    sent: false,
    reason: r.reason || "api-error",
    httpStatus: r.httpStatus,
    description: r.description,
    telegramStatus: "failed",
  };
}

/** إعادة إرسال إشعار طلب فشل — تحترم منع التكرار إلا بـ force صريح */
export const retryTelegramNotification = (ref, opts) => sendOrderNotification(ref, opts);

/* ================= تحديث الحالة (بنية جاهزة — تُفعَّل لاحقًا) ================= */

export async function sendOrderStatusUpdate(ref, newStatus) {
  const db = getDb();
  const order = findOrderRow(db, ref);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", "الطلب غير موجود.");
  const customer = db
    .prepare("SELECT name, phone FROM customers WHERE id = ?;")
    .get(order.customer_id) || {};
  const text = [
    "🔔 <b>تحديث حالة الطلب — أسواق البسيط</b>",
    "",
    `🔢 <b>رقم الطلب:</b> ${escapeHtml(order.order_number)}`,
    `👤 <b>العميل:</b> ${escapeHtml(customer.name)} (${escapeHtml(customer.phone)})`,
    `📊 <b>الحالة الجديدة:</b> ${STATUS_AR[newStatus] || escapeHtml(newStatus)}`,
  ].join("\n");
  return sendMessage(text);
}

/* ================= اختبار الاتصال ================= */

export async function testTelegramConnection() {
  if (!env.telegram.enabled) {
    return { sent: false, reason: "disabled", hint: "اضبط TELEGRAM_ENABLED=true في ملف .env" };
  }
  if (!env.telegram.botToken || !env.telegram.chatId) {
    return { sent: false, reason: "not-configured", hint: "اضبط TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في ملف .env" };
  }
  const r = await sendMessage(
    "🟢 <b>اختبار Telegram — أسواق البسيط</b>\n\nTelegram integration is working correctly. ✅"
  );
  if (r.sent) return { sent: true, messageId: r.messageId ?? null };
  return { sent: false, reason: r.reason || "api-error", httpStatus: r.httpStatus, description: r.description };
}

export default {
  sendMessage,
  sendOrderNotification,
  retryTelegramNotification,
  sendOrderStatusUpdate,
  testTelegramConnection,
};
