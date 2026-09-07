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
