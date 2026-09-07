// ==========================================================================
// أسواق البسيط — Category Service (الأقسام من قاعدة البيانات)
// --------------------------------------------------------------------------
// لا يوجد حذف للأقسام — التعطيل فقط (حماية المنتجات والطلبات القديمة).
// الـ slug ثابت بعد الإنشاء حتى لا تنكسر روابط المنتجات.
// ==========================================================================
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { logAudit } from "../utils/audit.js";

function toCategory(row, count) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    image: row.image || "",
    icon: row.image || "🗂️",
    active: Number(row.active) === 1,
    sortOrder: Number(row.sort_order) || 0,
    productsCount: count !== undefined ? count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** أقسام الواجهة العامة — النشطة فقط مرتبة */
export function listPublicCategories() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC, name ASC;").all();
  return rows.map((r) => toCategory(r));
}

/** كل الأقسام للإدارة + عدد المنتجات في كل قسم */
export function listAdminCategories() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM categories ORDER BY sort_order ASC, name ASC;").all();
  const counts = {};
  db.prepare("SELECT category, COUNT(*) AS n FROM products GROUP BY category;")
    .all()
    .forEach((r) => { counts[r.category] = r.n; });
  return rows.map((r) => toCategory(r, counts[r.slug] || counts[r.id] || 0));
}

const cleanStr = (v, max) => String(v ?? "").trim().slice(0, max);
const validSlug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

export function createCategory(body, actor) {
  const db = getDb();
  const name = cleanStr(body?.name, 60);
  if (name.length < 2) throw ApiError.badRequest("INVALID_NAME", "اسم القسم مطلوب (حرفان على الأقل).");
  let slug = cleanStr(body?.slug, 30).toLowerCase();
  if (!slug) slug = `c${Date.now().toString(36)}`;
  if (!validSlug(slug)) {
    throw ApiError.badRequest("INVALID_SLUG", "المعرف يجب أن يكون حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.");
  }
  if (db.prepare("SELECT 1 FROM categories WHERE slug = ? OR id = ?;").get(slug, slug)) {
    throw ApiError.conflict("SLUG_EXISTS", "هذا المعرف مستخدم بالفعل.");
  }
  const image = cleanStr(body?.image, 300);
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories;").get().m;
  const id = slug;
  db.prepare(
    "INSERT INTO categories (id, name, slug, image, active, sort_order) VALUES (?, ?, ?, ?, 1, ?);"
  ).run(id, name, slug, image || "🗂️", maxSort + 1);
  logAudit({ actor, action: "category.create", entity: "category", entityId: id, meta: { name } });
  return toCategory(db.prepare("SELECT * FROM categories WHERE id = ?;").get(id), 0);
}

export function updateCategory(id, body, actor) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM categories WHERE id = ?;").get(id);
  if (!existing) throw ApiError.notFound("CATEGORY_NOT_FOUND", "القسم غير موجود.");
  const b = body || {};

  // تحريك الترتيب: up | down (تبديل مع الجار)
  if (b.direction === "up" || b.direction === "down") {
    const neighbor = db.prepare(
      b.direction === "up"
        ? "SELECT * FROM categories WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1;"
        : "SELECT * FROM categories WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1;"
    ).get(existing.sort_order);
    if (neighbor) {
      db.prepare("UPDATE categories SET sort_order = ?, updated_at = datetime('now') WHERE id = ?;")
        .run(neighbor.sort_order, existing.id);
      db.prepare("UPDATE categories SET sort_order = ?, updated_at = datetime('now') WHERE id = ?;")
        .run(existing.sort_order, neighbor.id);
      logAudit({ actor, action: "category.reorder", entity: "category", entityId: id, meta: { direction: b.direction } });
    }
    return toCategory(db.prepare("SELECT * FROM categories WHERE id = ?;").get(id));
  }

  const patch = {};
  if (b.name !== undefined) {
    const name = cleanStr(b.name, 60);
    if (name.length < 2) throw ApiError.badRequest("INVALID_NAME", "اسم القسم مطلوب (حرفان على الأقل).");
    patch.name = name;
  }
  if (b.image !== undefined) patch.image = cleanStr(b.image, 300);
  if (b.active !== undefined) {
    patch.active = (b.active === true || b.active === 1 || b.active === "1" || b.active === "true") ? 1 : 0;
  }
  if (b.sortOrder !== undefined) {
    const s = Number(b.sortOrder);
    if (!Number.isInteger(s) || s < 0) throw ApiError.badRequest("INVALID_SORT", "الترتيب غير صحيح.");
    patch.sort_order = s;
  }
  const keys = Object.keys(patch);
  if (keys.length) {
    const set = keys.map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE categories SET ${set}, updated_at = datetime('now') WHERE id = ?;`)
      .run(...keys.map((k) => patch[k]), id);
  }
  if (keys.length) {
    logAudit({ actor, action: "category.update", entity: "category", entityId: id, meta: { changes: keys } });
  }
  return toCategory(db.prepare("SELECT * FROM categories WHERE id = ?;").get(id));
}

/** هل القسم (slug) موجود؟ — للتحقق عند إنشاء/تعديل منتج */
export function categoryExists(slug) {
  const db = getDb();
  return !!db.prepare("SELECT 1 FROM categories WHERE slug = ? OR id = ?;").get(slug, slug);
}
