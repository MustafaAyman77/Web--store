// ==========================================================================
// أسواق البسيط — إعدادات المتجر ومناطق التوصيل (Stage 11)
// --------------------------------------------------------------------------
// - صف واحد (id=1) + كاش داخل الذاكرة يُبطل عند كل حفظ (عملية واحدة).
// - العامة ترى نسخة آمنة فقط — lat/long للإدارة فقط (ولا تُعرض كحقيقة أبدًا).
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";

let cache = null;

function rowToSettings(r) {
  return {
    storeName: r.store_name || "",
    storeAddress: r.store_address || "",
    storePhone: r.store_phone || "",
    storeWhatsapp: r.store_whatsapp || "",
    storeDescription: r.store_description || "",
    storeLogo: r.store_logo || "",
    storeLatitude: r.store_latitude ?? null,
    storeLongitude: r.store_longitude ?? null,
    storeOpen247: Number(r.store_open_24_7) === 1,
    ordersEnabled: Number(r.orders_enabled) === 1,
    deliveryEnabled: Number(r.delivery_enabled) === 1,
    pickupEnabled: Number(r.pickup_enabled) === 1,
    minimumOrderAmount: Number(r.minimum_order_amount) || 0,
    freeDeliveryThreshold: Number(r.free_delivery_threshold) || 0,
    defaultDeliveryFee: Number(r.default_delivery_fee) || 0,
    estimatedPreparationMinutes: Number(r.estimated_preparation_minutes) || 0,
    customerOrderNote: r.customer_order_note || "",
    maintenanceMode: Number(r.maintenance_mode) === 1,
    updatedAt: r.updated_at,
  };
}

/** الإعدادات الكاملة (للإدارة والـBackend الداخلي) */
export function getSettings() {
  if (cache) return cache;
  const db = getDb();
  const row = db.prepare("SELECT * FROM store_settings WHERE id = 1;").get();
  if (!row) throw ApiError.internal("SETTINGS_MISSING", "إعدادات المتجر غير موجودة.");
  cache = rowToSettings(row);
  return cache;
}

export function invalidateSettingsCache() {
  cache = null;
}

/** النسخة العامة الآمنة — بدون إحداثيات أو أي بيانات حساسة */
export function getPublicStore() {
  const s = getSettings();
  return {
    storeName: s.storeName,
    storeAddress: s.storeAddress,
    storePhone: s.storePhone,
    storeWhatsapp: s.storeWhatsapp,
    storeDescription: s.storeDescription,
    storeLogo: s.storeLogo,
    storeOpen247: s.storeOpen247,
    ordersEnabled: s.ordersEnabled,
    deliveryEnabled: s.deliveryEnabled,
    pickupEnabled: s.pickupEnabled,
    minimumOrderAmount: s.minimumOrderAmount,
    freeDeliveryThreshold: s.freeDeliveryThreshold,
    estimatedPreparationMinutes: s.estimatedPreparationMinutes,
    customerOrderNote: s.customerOrderNote,
    maintenanceMode: s.maintenanceMode,
  };
}

const cleanStr = (v, max) => String(v ?? "").trim().slice(0, max);
const cleanNum = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};
const cleanBool = (v) => v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;

/** تحديث الإدارة — حقول مسموحة فقط + تحقق صارم */
export function updateSettings(body) {
  const db = getDb();
  const patch = {};
  const b = body || {};
  if (b.storeName !== undefined) {
    const v = cleanStr(b.storeName, 120);
    if (v.length < 2) throw ApiError.badRequest("INVALID_STORE_NAME", "اسم المتجر قصير جدًا.");
    patch.store_name = v;
  }
  if (b.storeAddress !== undefined) patch.store_address = cleanStr(b.storeAddress, 300);
  if (b.storePhone !== undefined) patch.store_phone = cleanStr(b.storePhone, 30);
  if (b.storeWhatsapp !== undefined) patch.store_whatsapp = cleanStr(b.storeWhatsapp, 30);
  if (b.storeDescription !== undefined) patch.store_description = cleanStr(b.storeDescription, 500);
  if (b.storeLogo !== undefined) patch.store_logo = cleanStr(b.storeLogo, 300);
  if (b.storeLatitude !== undefined) {
    if (b.storeLatitude === null || b.storeLatitude === "") patch.store_latitude = null;
    else {
      const v = cleanNum(b.storeLatitude, -90, 90);
      if (v === null) throw ApiError.badRequest("INVALID_LATITUDE", "خط العرض غير صحيح.");
      patch.store_latitude = v;
    }
  }
  if (b.storeLongitude !== undefined) {
    if (b.storeLongitude === null || b.storeLongitude === "") patch.store_longitude = null;
    else {
      const v = cleanNum(b.storeLongitude, -180, 180);
      if (v === null) throw ApiError.badRequest("INVALID_LONGITUDE", "خط الطول غير صحيح.");
      patch.store_longitude = v;
    }
  }
  ["storeOpen247", "ordersEnabled", "deliveryEnabled", "pickupEnabled", "maintenanceMode"].forEach((k) => {
    if (b[k] !== undefined) {
      patch[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] = cleanBool(b[k]);
    }
  });
  const nums = [
    ["minimumOrderAmount", 0, 1000000], ["freeDeliveryThreshold", 0, 1000000],
    ["defaultDeliveryFee", 0, 100000], ["estimatedPreparationMinutes", 0, 1440],
  ];
  nums.forEach(([k, min, max]) => {
    if (b[k] !== undefined) {
      const v = cleanNum(b[k], min, max);
      if (v === null) throw ApiError.badRequest("INVALID_NUMBER", `قيمة غير صحيحة: ${k}.`);
      patch[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] = Math.round(v * 100) / 100;
    }
  });
  if (b.customerOrderNote !== undefined) patch.customer_order_note = cleanStr(b.customerOrderNote, 300);

  const keys = Object.keys(patch);
  if (!keys.length) throw ApiError.badRequest("NOTHING_TO_UPDATE", "لا توجد بيانات لتحديثها.");
  db.prepare(`UPDATE store_settings SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = 1;`)
    .run(...keys.map((k) => patch[k]));
  invalidateSettingsCache();
  return getSettings();
}

/* ================= مناطق التوصيل ================= */

function rowToZone(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    deliveryFee: Number(r.delivery_fee) || 0,
    minimumOrderAmount: Number(r.minimum_order_amount) || 0,
    estimatedMinutes: Number(r.estimated_minutes) || 0,
    enabled: Number(r.enabled) === 1,
    updatedAt: r.updated_at,
  };
}

/** المناطق المفعلة للعميل */
export function listPublicZones() {
  const db = getDb();
  return db.prepare("SELECT * FROM delivery_zones WHERE enabled = 1 ORDER BY name ASC;").all().map(rowToZone);
}

/** كل المناطق للإدارة */
export function listAllZones() {
  const db = getDb();
  return db.prepare("SELECT * FROM delivery_zones ORDER BY enabled DESC, name ASC;").all().map(rowToZone);
}

export function getZoneById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM delivery_zones WHERE id = ?;").get(id);
  if (!row) throw ApiError.notFound("ZONE_NOT_FOUND", "منطقة التوصيل غير موجودة.");
  return rowToZone(row);
}

export function createZone(body) {
  const b = body || {};
  const name = cleanStr(b.name, 120);
  if (name.length < 2) throw ApiError.badRequest("INVALID_ZONE_NAME", "اسم المنطقة قصير جدًا.");
  const fee = b.deliveryFee === undefined ? 0 : cleanNum(b.deliveryFee, 0, 100000);
  const min = b.minimumOrderAmount === undefined ? 0 : cleanNum(b.minimumOrderAmount, 0, 1000000);
  const est = b.estimatedMinutes === undefined ? 0 : cleanNum(b.estimatedMinutes, 0, 1440);
  if (fee === null || min === null || est === null) {
    throw ApiError.badRequest("INVALID_NUMBER", "قيم المنطقة غير صحيحة.");
  }
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    "INSERT INTO delivery_zones (id, name, description, delivery_fee, minimum_order_amount, estimated_minutes, enabled) VALUES (?, ?, ?, ?, ?, ?, ?);"
  ).run(id, name, cleanStr(b.description, 300), fee, min, Math.round(est), b.enabled === undefined ? 1 : cleanBool(b.enabled));
  return getZoneById(id);
}

export function updateZone(id, body) {
  getZoneById(id); // 404 عند عدم الوجود
  const b = body || {};
  const patch = {};
  if (b.name !== undefined) {
    const v = cleanStr(b.name, 120);
    if (v.length < 2) throw ApiError.badRequest("INVALID_ZONE_NAME", "اسم المنطقة قصير جدًا.");
    patch.name = v;
  }
  if (b.description !== undefined) patch.description = cleanStr(b.description, 300);
  if (b.deliveryFee !== undefined) {
    const v = cleanNum(b.deliveryFee, 0, 100000);
    if (v === null) throw ApiError.badRequest("INVALID_NUMBER", "رسوم التوصيل غير صحيحة.");
    patch.delivery_fee = v;
  }
  if (b.minimumOrderAmount !== undefined) {
    const v = cleanNum(b.minimumOrderAmount, 0, 1000000);
    if (v === null) throw ApiError.badRequest("INVALID_NUMBER", "الحد الأدنى غير صحيح.");
    patch.minimum_order_amount = v;
  }
  if (b.estimatedMinutes !== undefined) {
    const v = cleanNum(b.estimatedMinutes, 0, 1440);
    if (v === null) throw ApiError.badRequest("INVALID_NUMBER", "الوقت المتوقع غير صحيح.");
    patch.estimated_minutes = Math.round(v);
  }
  if (b.enabled !== undefined) patch.enabled = cleanBool(b.enabled);
  const keys = Object.keys(patch);
  if (!keys.length) throw ApiError.badRequest("NOTHING_TO_UPDATE", "لا توجد بيانات لتحديثها.");
  const db = getDb();
  db.prepare(`UPDATE delivery_zones SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?;`)
    .run(...keys.map((k) => patch[k]), id);
  return getZoneById(id);
}

/** حذف ذكي: مرتبطة بطلبات → تعطيل (soft)؛ غير مرتبطة → حذف حقيقي */
export function deleteZone(id) {
  getZoneById(id); // 404 عند عدم الوجود
  const db = getDb();
  const linked = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE delivery_zone_id = ?;").get(id).n;
  if (linked > 0) {
    db.prepare("UPDATE delivery_zones SET enabled = 0, updated_at = datetime('now') WHERE id = ?;").run(id);
    return { deleted: false, disabled: true, linkedOrders: linked };
  }
  db.prepare("DELETE FROM delivery_zones WHERE id = ?;").run(id);
  return { deleted: true, disabled: false, linkedOrders: 0 };
}
