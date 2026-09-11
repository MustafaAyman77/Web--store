// ==========================================================================
// أسواق البسيط — Order Service (منطق الطلبات)
// --------------------------------------------------------------------------
// 🛡️ لا يثق بأي سعر قادم من المتصفح — كل الأسعار والإجماليات تُحسب هنا
// من قاعدة البيانات داخل Transaction واحدة (عميل → طلب → أصناف → مخزون).
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { getDb, transaction } from "../database/database.js";
import { generateOrderNumber } from "../utils/order-number.js";
import { validateEgyptianPhone } from "../utils/phone.js";
import { ApiError } from "../utils/api-error.js";
import { sendOrderNotification } from "./telegram.service.js";
import { deductForOrder, restoreForOrder } from "./inventory.service.js";
import { assertCustomerCanOrder } from "./customer.service.js";
import { getSettings } from "./settings.service.js";
import { resolvePromosForProducts } from "./promotion.service.js";
import { recordStatusChange } from "./status-history.service.js";
import { createStatusNotification } from "./notification.service.js";

export const ORDER_STATUSES = [
  "new", "confirmed", "preparing", "ready",
  "out_for_delivery", "completed", "cancelled",
];

/** انتقالات الحالة المسموحة — completed/cancelled نهائية ولا خروج منها */
export const ORDER_TRANSITIONS = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const allowedNext = (status) => [...(ORDER_TRANSITIONS[status] || [])];

const MAX_QTY = 20;

/* ================= التحقق من المدخلات ================= */

function cleanStr(v, max = 200) {
  return String(v ?? "").trim().slice(0, max);
}

function validatePayload(body) {
  const customer = body?.customer || {};
  const name = cleanStr(customer.name, 100).replace(/\s+/g, " ");
  if (name.length < 3) {
    throw ApiError.badRequest("INVALID_NAME", "من فضلك أدخل اسمك بالكامل.");
  }
  const phone = validateEgyptianPhone(customer.phone);
  if (!phone) {
    throw ApiError.badRequest("INVALID_PHONE", "من فضلك أدخل رقم هاتف مصري صحيح.");
  }

  const fulfillmentMethod = body?.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
  // بوابات المتجر/المنطقة تُفحص في resolveFulfillment (من الـDB — وليس الثقة بالمدخلات)

  const address = cleanStr(customer.address, 300);
  if (fulfillmentMethod === "delivery" && address.length < 5) {
    throw ApiError.badRequest("INVALID_ADDRESS", "من فضلك اكتب عنوان التوصيل.");
  }

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest("EMPTY_ITEMS", "الطلب لا يحتوي على منتجات.");
  }
  if (items.length > 50) {
    throw ApiError.badRequest("TOO_MANY_ITEMS", "عدد الأصناف أكبر من المسموح.");
  }
  const normalized = items.map((it) => {
    const productId = String(it?.productId ?? it?.id ?? "").trim();
    const quantity = Number(it?.quantity);
    if (!productId) throw ApiError.badRequest("INVALID_ITEM", "بيانات صنف غير صحيحة.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw ApiError.badRequest("INVALID_QUANTITY", "الكمية يجب أن تكون رقمًا صحيحًا بين 1 و 20.");
    }
    return { productId, quantity };
  });

  return {
    customer: {
      name,
      phone,
      address: fulfillmentMethod === "delivery" ? address : "",
      area: fulfillmentMethod === "delivery" ? cleanStr(customer.area, 100) : "",
      landmark: fulfillmentMethod === "delivery" ? cleanStr(customer.landmark, 200) : "",
    },
    fulfillmentMethod,
    deliveryZoneId: String(body?.deliveryZoneId || "").trim().slice(0, 60),
    notes: cleanStr(body?.notes, 500),
    items: normalized,
  };
}

/* ================= تسعير الأصناف من الـDB (مشترك: إنشاء + عرض سعر) ================= */

function priceLines(db, items) {
  const getProduct = db.prepare("SELECT * FROM products WHERE id = ?;");
  const promoMap = resolvePromosForProducts(db, items.map((it) => it.productId));
  const lines = items.map(({ productId, quantity }) => {
    const p = getProduct.get(productId);
    if (!p) throw ApiError.notFound("PRODUCT_NOT_FOUND", `المنتج غير موجود (${productId}).`);
    if (Number(p.available) !== 1) {
      throw ApiError.badRequest("PRODUCT_UNAVAILABLE", `"${p.name}" غير متوفر حاليًا.`);
    }
    const tracked = Number(p.stock_tracking) === 1;
    if (tracked && Number(p.stock_quantity) < quantity) {
      throw ApiError.badRequest("INSUFFICIENT_STOCK", "الكمية المطلوبة من هذا المنتج غير متاحة حاليًا");
    }
    const base = Number(p.price);
    if (!Number.isFinite(base) || base < 0) {
      throw ApiError.badRequest("INVALID_PRICE", "سعر المنتج غير صالح.");
    }
    // السعر النهائي بعد العرض الفائز (إن وجد) + لقطة كاملة للفاتورة
    const hit = promoMap[p.id];
    const price = hit ? hit.finalPrice : base;
    const discount = hit ? Math.round((base - hit.finalPrice) * 100) / 100 : 0;
    return {
      productId: p.id, productName: p.name, quantity, price, subtotal: price * quantity, tracked,
      originalPrice: base, discountAmount: discount,
      promotionId: hit ? hit.promo.id : null, promotionName: hit ? hit.promo.name : "",
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const originalSubtotal = lines.reduce((s, l) => s + l.originalPrice * l.quantity, 0);
  return { lines, subtotal, originalSubtotal, discountTotal: Math.round((originalSubtotal - subtotal) * 100) / 100 };
}

/* ================= بوابات المتجر + حساب التوصيل (Backend فقط) ================= */

function resolveFulfillment(db, { fulfillmentMethod, deliveryZoneId, subtotal }) {
  const st = getSettings();
  if (st.maintenanceMode) {
    throw ApiError.forbidden("MAINTENANCE_MODE", "المتجر تحت الصيانة حاليًا — نعود للعمل قريبًا.");
  }
  if (!st.ordersEnabled) {
    throw ApiError.forbidden("ORDERS_DISABLED", "المتجر لا يستقبل الطلبات حاليًا.");
  }
  if (fulfillmentMethod === "pickup") {
    if (!st.pickupEnabled) {
      throw ApiError.badRequest("PICKUP_DISABLED", "الاستلام من المحل غير متاح حاليًا.");
    }
    return { deliveryFee: null, zoneId: null, zoneName: "" };
  }
  // توصيل
  if (!st.deliveryEnabled) {
    if (!st.pickupEnabled) {
      throw ApiError.badRequest("NO_FULFILLMENT", "المتجر لا يوفر طرق استلام متاحة حاليًا.");
    }
    throw ApiError.badRequest("DELIVERY_DISABLED", "خدمة التوصيل غير متاحة حاليًا — اختر الاستلام من المحل.");
  }
  if (!deliveryZoneId) {
    throw ApiError.badRequest("ZONE_REQUIRED", "من فضلك اختر منطقة التوصيل.");
  }
  const zone = db.prepare("SELECT * FROM delivery_zones WHERE id = ?;").get(deliveryZoneId);
  if (!zone || Number(zone.enabled) !== 1) {
    throw ApiError.badRequest("ZONE_INVALID", "منطقة التوصيل غير متاحة حاليًا.");
  }
  const zoneMin = Number(zone.minimum_order_amount) || 0;
  const effectiveMin = zoneMin > 0 ? zoneMin : st.minimumOrderAmount;
  if (effectiveMin > 0 && subtotal < effectiveMin) {
    throw ApiError.badRequest("MINIMUM_ORDER", `الحد الأدنى لطلب التوصيل في هذه المنطقة هو ${effectiveMin} جنيه.`);
  }
  let fee = Number(zone.delivery_fee) || 0;
  if (fee <= 0 && st.defaultDeliveryFee > 0) fee = st.defaultDeliveryFee;
  if (st.freeDeliveryThreshold > 0 && subtotal >= st.freeDeliveryThreshold) fee = 0;
  return { deliveryFee: Math.round(fee * 100) / 100, zoneId: zone.id, zoneName: zone.name };
}

/** عرض سعر للـCheckout — نفس حساب الإنشاء تمامًا، بدون حفظ */
export function quoteTotals(body) {
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw ApiError.badRequest("EMPTY_ITEMS", "الطلب لا يحتوي على منتجات.");
  }
  const normalized = items.map((it) => {
    const productId = String(it?.productId ?? it?.id ?? "").trim();
    const quantity = Number(it?.quantity);
    if (!productId) throw ApiError.badRequest("INVALID_ITEM", "بيانات صنف غير صحيحة.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw ApiError.badRequest("INVALID_QUANTITY", "الكمية يجب أن تكون رقمًا صحيحًا بين 1 و 20.");
    }
    return { productId, quantity };
  });
  const db = getDb();
  const { subtotal, originalSubtotal, discountTotal } = priceLines(db, normalized);
  const fulfillmentMethod = body?.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
  const ff = resolveFulfillment(db, {
    fulfillmentMethod,
    deliveryZoneId: String(body?.deliveryZoneId || "").trim().slice(0, 60),
    subtotal,
  });
  return {
    fulfillmentMethod,
    subtotal, originalSubtotal, discountTotal,
    deliveryFee: ff.deliveryFee, total: subtotal + (ff.deliveryFee || 0),
    deliveryZoneId: ff.zoneId, deliveryZoneName: ff.zoneName,
  };
}

/* ================= إنشاء الطلب ================= */

export async function createOrder(body) {
  const input = validatePayload(body);

  const result = transaction((db) => {
    // 1) التحقق من الأصناف + حساب الأسعار من الـDB
    const { lines, subtotal, originalSubtotal, discountTotal } = priceLines(db, input.items);
    const trackedLines = lines.filter((l) => l.tracked);
    // 1ب) بوابات المتجر + رسوم التوصيل من الـDB (لا ثقة بأي قيمة من المتصفح)
    const ff = resolveFulfillment(db, {
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryZoneId: input.deliveryZoneId,
      subtotal,
    });
    const deliveryFee = ff.deliveryFee;
    const total = subtotal + (deliveryFee || 0);

    // 2) العميل: موجود بنفس الهاتف → استخدام + تحديث بياناته، وإلا → جديد
    let customer = db.prepare("SELECT * FROM customers WHERE phone = ?;").get(input.customer.phone);
    if (customer) {
      assertCustomerCanOrder(customer);
      // تحديث غير مُتلِف: القيم الفارغة الجديدة لا تمسح القديمة
      db.prepare(
        "UPDATE customers SET name = ?, address = ?, area = ?, landmark = ?, updated_at = datetime('now') WHERE id = ?;"
      ).run(
        input.customer.name || customer.name,
        input.customer.address || customer.address,
        input.customer.area || customer.area,
        input.customer.landmark || customer.landmark,
        customer.id
      );
    } else {
      customer = { id: uuidv4(), ...input.customer };
      db.prepare(
        "INSERT INTO customers (id, name, phone, address, area, landmark) VALUES (?, ?, ?, ?, ?, ?);"
      ).run(customer.id, customer.name, customer.phone, customer.address, customer.area, customer.landmark);
    }

    // 3) الطلب + الأصناف + خصم المخزون
    const orderId = uuidv4();
    const orderNumber = generateOrderNumber(db);
    db.prepare(
      `INSERT INTO orders
       (id, order_number, customer_id, subtotal, delivery_fee, total, fulfillment_method, delivery_zone_id, delivery_zone_name, notes, status, telegram_status, stock_deducted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?);`
    ).run(orderId, orderNumber, customer.id, subtotal, deliveryFee, total, input.fulfillmentMethod, ff.zoneId, ff.zoneName, input.notes, env.telegram.enabled ? "pending" : "disabled", trackedLines.length ? 1 : 0);

    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price, subtotal, original_price, final_price, discount_amount, promotion_id, promotion_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
    );
    for (const l of lines) {
      insertItem.run(uuidv4(), orderId, l.productId, l.productName, l.quantity, l.price, l.subtotal,
        l.originalPrice, l.price, l.discountAmount, l.promotionId, l.promotionName);
    }
    // خصم المخزون + تسجيل حركات بيع — داخل نفس الـTransaction
    if (trackedLines.length) deductForOrder(db, trackedLines, orderNumber);
    // تاريخ الحالة + إشعار الاستلام — داخل نفس الـTransaction
    recordStatusChange(db, { orderId, status: "new", changedBy: "system" });
    createStatusNotification(db, {
      customerId: customer.id, orderId, orderNumber,
      status: "new", fulfillmentMethod: input.fulfillmentMethod,
    });

    return {
      orderId,
      orderNumber,
      status: "new",
      subtotal,
      originalSubtotal,
      discountTotal,
      deliveryFee,
      total,
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryZoneId: ff.zoneId,
      deliveryZoneName: ff.zoneName,
      itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    };
  });

  // 4) إشعار Telegram — بعد نجاح الحفظ فقط، ولا يُفشل الطلب أبدًا
  let telegramStatus = "disabled";
  try {
    const tg = await sendOrderNotification(result.orderId);
    telegramStatus = tg.sent ? "sent" : (tg.reason === "disabled" ? "disabled" : "failed");
  } catch {
    telegramStatus = "failed";
  }

  return { ...result, telegramStatus };
}

/* ================= قراءة وتحديث ================= */

export function getOrderByIdOrNumber(ref) {
  const db = getDb();
  let order = db.prepare("SELECT * FROM orders WHERE id = ?;").get(ref);
  if (!order) order = db.prepare("SELECT * FROM orders WHERE order_number = ?;").get(ref);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", "الطلب غير موجود.");
  const items = db.prepare("SELECT product_id AS productId, product_name AS name, quantity, price, subtotal, original_price AS originalPrice, discount_amount AS discountAmount, promotion_name AS promotionName FROM order_items WHERE order_id = ?;").all(order.id);
  const customer = db.prepare("SELECT id, name, phone, address, area, landmark FROM customers WHERE id = ?;").get(order.customer_id);
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    telegramStatus: order.telegram_status || "pending",
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    total: order.total,
    fulfillmentMethod: order.fulfillment_method,
    deliveryZoneId: order.delivery_zone_id || null,
    deliveryZoneName: order.delivery_zone_name || "",
    notes: order.notes,
    createdAt: order.created_at,
    customer,
    items,
  };
}

export function listOrders({ status, search, limit = 20, offset = 0, page } = {}) {
  limit = Math.min(100, Math.max(1, Number(limit) || 20));
  if (page) offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  else offset = Math.max(0, Number(offset) || 0);
  const db = getDb();
  const conds = [];
  const vals = [];
  if (status) { conds.push("o.status = ?"); vals.push(status); }
  if (search) {
    conds.push("(o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)");
    const like = `%${String(search).slice(0, 60)}%`;
    vals.push(like, like, like);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT o.id, o.order_number AS orderNumber, o.status, o.subtotal, o.delivery_fee AS deliveryFee,
            o.total, o.fulfillment_method AS fulfillmentMethod, o.created_at AS createdAt,
            o.telegram_status AS telegramStatus,
            c.name AS customerName, c.phone AS customerPhone,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS linesCount,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS itemsCount
     FROM orders o JOIN customers c ON c.id = o.customer_id
     ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?;`
  ).all(...vals, limit, offset);
  const totalRow = db.prepare(
    `SELECT COUNT(*) AS count FROM orders o JOIN customers c ON c.id = o.customer_id ${where};`
  ).get(...vals);
  return { orders: rows, total: totalRow.count, limit, offset, page: Math.floor(offset / limit) + 1 };
}

export function updateOrderStatus(ref, status, actor) {
  if (!ORDER_STATUSES.includes(status)) {
    throw ApiError.badRequest("INVALID_STATUS", "حالة الطلب غير صحيحة.");
  }
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?;").get(ref, ref);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", "الطلب غير موجود.");
  if (order.status === status) {
    return { orderId: order.id, orderNumber: order.order_number, status, unchanged: true };
  }
  if (!allowedNext(order.status).includes(status)) {
    throw ApiError.badRequest(
      "INVALID_TRANSITION",
      `لا يمكن نقل الطلب من "${order.status}" إلى "${status}".`
    );
  }
  const restored = transaction((tx) => {
    tx.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?;").run(status, order.id);
    // التاريخ + إشعار العميل — داخل نفس الـTransaction (فشلها يُلغي تغيير الحالة)
    recordStatusChange(tx, { orderId: order.id, status, changedBy: "admin" });
    createStatusNotification(tx, {
      customerId: order.customer_id, orderId: order.id, orderNumber: order.order_number,
      status, fulfillmentMethod: order.fulfillment_method,
    });
    // الإلغاء يعيد المخزون مرة واحدة فقط (لطلبات خُصم مخزونها فعلًا)
    if (status === "cancelled" && Number(order.stock_deducted) === 1 && Number(order.stock_restored) !== 1) {
      return restoreForOrder(tx, order.id, order.order_number, actor || "");
    }
    return 0;
  });
  return { orderId: order.id, orderNumber: order.order_number, status, prevStatus: order.status, stockRestored: restored };
}

/* ================= تتبع الضيف (رقم طلب + هاتف — خطأ موحّد) ================= */

const TRACK_FAIL = "لم نتمكن من العثور على هذا الطلب. تأكد من رقم الطلب ورقم الهاتف.";

export function trackOrder({ orderNumber, phone }) {
  if (!env.tracking.enabled) {
    throw ApiError.forbidden("TRACKING_DISABLED", "خدمة تتبع الطلب غير متاحة حاليًا.");
  }
  const ref = String(orderNumber || "").trim().slice(0, 40);
  const normalized = validateEgyptianPhone(phone);
  if (!ref || !normalized) throw ApiError.notFound("ORDER_NOT_FOUND", TRACK_FAIL);
  const db = getDb();
  // مطابقة مزدوجة في استعلام واحد — لا كشف لأي جزء على حدة
  const order = db
    .prepare(
      `SELECT o.* FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.order_number = ? AND c.phone = ?;`
    )
    .get(ref, normalized);
  if (!order) throw ApiError.notFound("ORDER_NOT_FOUND", TRACK_FAIL);
  const items = db
    .prepare("SELECT product_name AS name, quantity, price, subtotal, original_price AS originalPrice, discount_amount AS discountAmount, promotion_name AS promotionName FROM order_items WHERE order_id = ?;")
    .all(order.id);
  return {
    orderNumber: order.order_number,
    status: order.status,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    total: order.total,
    fulfillmentMethod: order.fulfillment_method,
    deliveryZoneId: order.delivery_zone_id || null,
    deliveryZoneName: order.delivery_zone_name || "",
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items,
    statusHistory: getStatusHistorySafe(order.id),
  };
}

function getStatusHistorySafe(orderId) {
  try {
    const db = getDb();
    return db
      .prepare("SELECT status, created_at AS createdAt FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, rowid ASC;")
      .all(orderId);
  } catch {
    return [];
  }
}

export function getCustomerById(id) {
  const db = getDb();
  const customer = db.prepare("SELECT id, name, phone, address, area, landmark, created_at AS createdAt FROM customers WHERE id = ?;").get(id);
  if (!customer) throw ApiError.notFound("CUSTOMER_NOT_FOUND", "العميل غير موجود.");
  return customer;
}

export function findCustomerByPhone(phone) {
  const db = getDb();
  return db.prepare("SELECT id, name, phone, address, area, landmark FROM customers WHERE phone = ?;").get(phone) || null;
}
