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
