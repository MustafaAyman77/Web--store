// ==========================================================================
// أسواق البسيط — SQLite connection (node:sqlite المدمجة في Node 22)
// لا حاجة لأي مكتبة خارجية لقاعدة البيانات.
// 🔮 عند النقل إلى Production: يُستبدل هذا الملف فقط (نفس الواجهة).
// ==========================================================================
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// جذر مجلد backend (env.js داخل src/config → الصعود 3 مستويات)
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

function resolveDbPath() {
  const p = env.databasePath;
  return path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
}

let db = null;

export function getDb() {
  if (db) return db;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  // بناء الجداول (آمن للتكرار)
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
  migrate(db);
  return db;
}

/** ترحيلات خفيفة لقواعد البيانات الموجودة (آمنة للتكرار) */
function migrate(database) {
  const cols = database.prepare("PRAGMA table_info(orders);").all().map((c) => c.name);
  const ensure = (name, ddl) => {
    if (!cols.includes(name)) database.exec(`ALTER TABLE orders ADD COLUMN ${ddl};`);
  };
  ensure("telegram_status", "telegram_status TEXT NOT NULL DEFAULT 'pending'");
  ensure("telegram_message_id", "telegram_message_id INTEGER");
  ensure("telegram_sent_at", "telegram_sent_at TEXT");
  ensure("telegram_error", "telegram_error TEXT");
  // طلبات قديمة قبل نظام Telegram → معطّلة، وأي إرسال متقطع → فاشل
  database.exec("UPDATE orders SET telegram_status = 'disabled' WHERE telegram_status = 'pending';");
  database.exec("UPDATE orders SET telegram_status = 'failed', telegram_error = 'interrupted: server restarted during send' WHERE telegram_status = 'sending';");
  database.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, admin_username TEXT NOT NULL, action TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '', entity_id TEXT NOT NULL DEFAULT '',
    meta TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const auditCols = database.prepare("PRAGMA table_info(audit_logs);").all().map((c) => c.name);
  if (auditCols.includes("actor") && !auditCols.includes("admin_username")) {
    database.exec("ALTER TABLE audit_logs RENAME COLUMN actor TO admin_username;");
  }
  database.exec("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);");

  // --- المرحلة 7: حقول المخزون في المنتجات والطلبات ---
  const productCols = database.prepare("PRAGMA table_info(products);").all().map((c) => c.name);
  if (!productCols.includes("low_stock_threshold")) {
    database.exec("ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;");
  }
  if (!productCols.includes("stock_tracking")) {
    database.exec("ALTER TABLE products ADD COLUMN stock_tracking INTEGER NOT NULL DEFAULT 1;");
    // المنتجات التي كانت بدون مخزون (NULL) تبقى بدون تتبع
    database.exec("UPDATE products SET stock_tracking = 0 WHERE stock_quantity IS NULL;");
  }
  const orderCols = database.prepare("PRAGMA table_info(orders);").all().map((c) => c.name);
  if (!orderCols.includes("stock_deducted")) {
    database.exec("ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0;");
  }
  if (!orderCols.includes("stock_restored")) {
    database.exec("ALTER TABLE orders ADD COLUMN stock_restored INTEGER NOT NULL DEFAULT 0;");
  }
  database.exec(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    image TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
    type TEXT NOT NULL, quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL, new_quantity INTEGER NOT NULL,
    reason TEXT DEFAULT '', admin_username TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);");
  seedCategories(database);
  // --- المرحلة 8: حقول العملاء + فهارس التوصيات ---
  const customerCols = database.prepare("PRAGMA table_info(customers);").all().map((c) => c.name);
  if (!customerCols.includes("email")) database.exec("ALTER TABLE customers ADD COLUMN email TEXT DEFAULT '';");
  if (!customerCols.includes("notes")) database.exec("ALTER TABLE customers ADD COLUMN notes TEXT DEFAULT '';");
  if (!customerCols.includes("status")) database.exec("ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
  database.exec("CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, status);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);");
  // --- المرحلة 9: حسابات العملاء + OTP + الجلسات ---
  if (!customerCols.includes("account_enabled")) database.exec("ALTER TABLE customers ADD COLUMN account_enabled INTEGER NOT NULL DEFAULT 0;");
  if (!customerCols.includes("phone_verified")) database.exec("ALTER TABLE customers ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;");
  if (!customerCols.includes("last_login_at")) database.exec("ALTER TABLE customers ADD COLUMN last_login_at TEXT;");
  database.exec(`CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id), phone TEXT NOT NULL,
    code_hash TEXT NOT NULL, expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);");
  database.exec(`CREATE TABLE IF NOT EXISTS customer_sessions (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_token ON customer_sessions(token_hash);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);");
  // --- المرحلة 10: تاريخ الحالات + الإشعارات ---
  database.exec(`CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    status TEXT NOT NULL, changed_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_osh_order ON order_status_history(order_id, created_at);");
  database.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
    order_id TEXT REFERENCES orders(id), type TEXT NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (customer_id, order_id, type));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_notif_customer ON notifications(customer_id, created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(customer_id, is_read);");
  // --- المرحلة 11: إعدادات المتجر + مناطق التوصيل + حقول المنطقة في الطلبات ---
  database.exec(`CREATE TABLE IF NOT EXISTS store_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), store_name TEXT NOT NULL DEFAULT 'أسواق البسيط',
    store_address TEXT NOT NULL DEFAULT '', store_phone TEXT NOT NULL DEFAULT '',
    store_whatsapp TEXT NOT NULL DEFAULT '', store_description TEXT NOT NULL DEFAULT '',
    store_logo TEXT NOT NULL DEFAULT '', store_latitude REAL, store_longitude REAL,
    store_open_24_7 INTEGER NOT NULL DEFAULT 1, orders_enabled INTEGER NOT NULL DEFAULT 1,
    delivery_enabled INTEGER NOT NULL DEFAULT 1, pickup_enabled INTEGER NOT NULL DEFAULT 1,
    minimum_order_amount REAL NOT NULL DEFAULT 0, free_delivery_threshold REAL NOT NULL DEFAULT 0,
    default_delivery_fee REAL NOT NULL DEFAULT 0, estimated_preparation_minutes INTEGER NOT NULL DEFAULT 0,
    customer_order_note TEXT NOT NULL DEFAULT '', maintenance_mode INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec(`CREATE TABLE IF NOT EXISTS delivery_zones (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    delivery_fee REAL NOT NULL DEFAULT 0, minimum_order_amount REAL NOT NULL DEFAULT 0,
    estimated_minutes INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_zones_enabled ON delivery_zones(enabled);");
  const orderCols11 = database.prepare("PRAGMA table_info(orders);").all().map((c) => c.name);
  if (!orderCols11.includes("delivery_zone_id")) database.exec("ALTER TABLE orders ADD COLUMN delivery_zone_id TEXT;");
  if (!orderCols11.includes("delivery_zone_name")) database.exec("ALTER TABLE orders ADD COLUMN delivery_zone_name TEXT DEFAULT '';");
  seedStoreSettings(database);
  seedDeliveryZones(database);
  // --- المرحلة 12: العروض + لقطة الأسعار في الأصناف ---
  database.exec(`CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL, discount_value REAL NOT NULL DEFAULT 0, fixed_price REAL,
    start_at TEXT, end_at TEXT, enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec(`CREATE TABLE IF NOT EXISTS promotion_products (
    id TEXT PRIMARY KEY, promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (promotion_id, product_id));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_pp_promo ON promotion_products(promotion_id);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_pp_product ON promotion_products(product_id);");
  const itemCols = database.prepare("PRAGMA table_info(order_items);").all().map((c) => c.name);
  if (!itemCols.includes("original_price")) database.exec("ALTER TABLE order_items ADD COLUMN original_price REAL;");
  if (!itemCols.includes("final_price")) database.exec("ALTER TABLE order_items ADD COLUMN final_price REAL;");
  if (!itemCols.includes("discount_amount")) database.exec("ALTER TABLE order_items ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;");
  if (!itemCols.includes("promotion_id")) database.exec("ALTER TABLE order_items ADD COLUMN promotion_id TEXT;");
  if (!itemCols.includes("promotion_name")) database.exec("ALTER TABLE order_items ADD COLUMN promotion_name TEXT DEFAULT '';");
  // --- المرحلة 13: أحداث البحث + فهارس البحث ---
  database.exec(`CREATE TABLE IF NOT EXISTS search_events (
    id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id),
    query TEXT NOT NULL DEFAULT '', normalized_query TEXT NOT NULL DEFAULT '',
    results_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_search_norm ON search_events(normalized_query);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_search_zero ON search_events(results_count, normalized_query);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_search_created ON search_events(created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);");
  const adminCols = database.prepare("PRAGMA table_info(admins);").all().map((c) => c.name);
  if (!adminCols.includes("role")) {
    database.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';");
  }
}

const DEFAULT_CATEGORIES = [
  ["beverages", "المشروبات", "🥤", 1],
  ["snacks", "السناكس والحلويات", "🍫", 2],
  ["dairy", "الألبان", "🥛", 3],
  ["grocery", "البقالة", "🛒", 4],
  ["cleaning", "المنظفات", "🧹", 5],
  ["care", "العناية الشخصية", "🧴", 6],
  ["frozen", "المجمدات", "🧊", 7],
  ["home", "مستلزمات المنزل", "🏠", 8],
  ["offers", "عروض مجمعة", "🎁", 9],
];

/** زراعة صف إعدادات المتجر مرة واحدة — القيم الأولية من .env ثم تُدار من الإدارة */
function seedStoreSettings(database) {
  const row = database.prepare("SELECT id FROM store_settings WHERE id = 1;").get();
  if (row) return;
  database.prepare(
    `INSERT INTO store_settings (id, store_name, store_address, store_description, store_open_24_7,
      orders_enabled, delivery_enabled, pickup_enabled, minimum_order_amount,
      free_delivery_threshold, default_delivery_fee, estimated_preparation_minutes)
     VALUES (1, ?, ?, ?, 1, 1, ?, 1, 0, 0, ?, 0);`
  ).run(
    "أسواق البسيط",
    "شارع الحجاز، مدينة مغاغة، محافظة المنيا، مصر",
    "سوبر ماركت في شارع الحجاز، مدينة مغاغة — محافظة المنيا.",
    (typeof env !== "undefined" && env.delivery && env.delivery.enabled) ? 1 : 0,
    (typeof env !== "undefined" && env.delivery) ? (Number(env.delivery.fee) || 0) : 0
  );
}

/** 3 مناطق تجريبية واضحة — تُستبدل ببيانات المحل الحقيقية من الإدارة */
function seedDeliveryZones(database) {
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM delivery_zones;").get();
  if (count > 0) return;
  const zones = [
    ["dz-demo-1", "المنطقة التجريبية 1", "بيانات تجريبية — تُعدَّل من لوحة التحكم.", 10, 0, 30],
    ["dz-demo-2", "المنطقة التجريبية 2", "بيانات تجريبية — تُعدَّل من لوحة التحكم.", 15, 50, 45],
    ["dz-demo-3", "المنطقة التجريبية 3", "بيانات تجريبية — تُعدَّل من لوحة التحكم.", 20, 100, 60],
  ];
  const ins = database.prepare(
    "INSERT INTO delivery_zones (id, name, description, delivery_fee, minimum_order_amount, estimated_minutes, enabled) VALUES (?, ?, ?, ?, ?, ?, 1);"
  );
  zones.forEach((z) => ins.run(...z));
}

/** زراعة الأقسام الافتراضية مرة واحدة (لا تمس أي بيانات موجودة) */
function seedCategories(database) {
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM categories;").get();
  if (count > 0) return;
  const insert = database.prepare(
    "INSERT INTO categories (id, name, slug, image, active, sort_order) VALUES (?, ?, ?, ?, 1, ?);"
  );
  for (const [id, name, image, sort] of DEFAULT_CATEGORIES) {
    insert.run(id, name, id, image, sort);
  }
}

/** تنفيذ دالة داخل Transaction — أي خطأ = Rollback تلقائي */
export function transaction(fn) {
  const database = getDb();
  database.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn(database);
    database.exec("COMMIT;");
    return result;
  } catch (err) {
    try { database.exec("ROLLBACK;"); } catch { /* تجاهل */ }
    throw err;
  }
}

export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* تجاهل */ }
    db = null;
  }
}
