// ==========================================================================
// أسواق البسيط — Seed: بناء قاعدة البيانات + البيانات التجريبية + Admin
// التشغيل: npm run seed  |  إعادة البناء الكامل: npm run seed:force
// ==========================================================================
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./database.js";
import { env } from "../config/env.js";
import { SEED_PRODUCTS } from "./seed-data.js";

const STOCK_DEFAULT = 100; // مخزون تجريبي سخي حتى لا يعيق الـDemo

function seedProducts(db, force) {
  if (force) {
    db.exec("DELETE FROM order_items;");
    db.exec("DELETE FROM orders;");
    db.exec("DELETE FROM products;");
  }
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM products;").get();
  if (count > 0 && !force) {
    console.log(`[seed] المنتجات موجودة بالفعل (${count}) — تخطي. استخدم --force لإعادة البناء.`);
    return count;
  }
  const insert = db.prepare(
    `INSERT INTO products
     (id, name, category, description, price, old_price, unit, image, tint,
      badge_text, badge_tone, available, featured, offer, stock_quantity,
      stock_tracking, low_stock_threshold, popularity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
  );
  let n = 0;
  for (const p of SEED_PRODUCTS) {
    const [badgeText = "", badgeTone = ""] = String(p.badge || "").split("|");
    const offer = badgeTone === "offer" || (p.oldPrice && p.oldPrice > p.price) ? 1 : 0;
    insert.run(
      p.id, p.name, p.category, p.desc || "", p.price, p.oldPrice ?? null,
      p.unit || "", p.icon || "", JSON.stringify(p.tint || []),
      badgeText, badgeTone, p.available ? 1 : 0, p.featured ? 1 : 0, offer,
      p.available ? STOCK_DEFAULT : 0, 1, 5, p.popularity ?? 50
    );
    n++;
  }
  // عينات Demo للمخزون: منتج منخفض + منتجان نافذان (p22/p28 غير متاحين أصلًا)
  db.prepare("UPDATE products SET stock_quantity = 3 WHERE id = 'p05';").run();
  console.log(`[seed] تمت زراعة ${n} منتجًا تجريبيًا.`);
  return n;
}

async function seedAdmin(db, force) {
  const username = env.admin.username;
  if (force) db.prepare("DELETE FROM admins WHERE username = ?;").run(username);
  const exists = db.prepare("SELECT id FROM admins WHERE username = ?;").get(username);
  if (exists) {
    console.log(`[seed] حساب الأدمن "${username}" موجود — تخطي.`);
    return;
  }
  if (!env.admin.password || env.admin.password === "CHANGE_ME") {
    console.warn('[seed] ⚠️  ADMIN_PASSWORD ما زالت CHANGE_ME — اضبطها في ملف .env ثم أعد التزويد.');
  }
  const hash = await bcrypt.hash(env.admin.password, 10);
  db.prepare("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?);")
    .run(uuidv4(), username, hash);
  console.log(`[seed] تم إنشاء حساب الأدمن "${username}" (كلمة مرور مشفَّرة).`);
}

async function main() {
  const force = process.argv.includes("--force");
  const db = getDb();
  console.log("[seed] قاعدة البيانات:", env.databasePath);
  seedProducts(db, force);
  await seedAdmin(db, force);
  console.log("[seed] ✅ اكتمل التزويد.");
}

main().catch((err) => {
  console.error("[seed] ❌ فشل التزويد:", err.message);
  process.exit(1);
});
