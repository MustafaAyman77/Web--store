// ==========================================================================
// Admin Controller — الدخول + إدارة الطلبات (محمي بـ requireAdmin)
// ⚠️ لا يُعرض password_hash عبر أي API أبدًا.
// ==========================================================================
import bcrypt from "bcryptjs";
import { getDb } from "../database/database.js";
import { ApiError } from "../utils/api-error.js";
import { createSession, destroySessionByRequest } from "../middleware/auth.middleware.js";
import { listOrders, updateOrderStatus, ORDER_STATUSES } from "../services/order.service.js";
import { testTelegramConnection, retryTelegramNotification } from "../services/telegram.service.js";
import {
  getDashboard, getAdminOrderDetails, listCustomers, getCustomerDetails,
  listProductsAdmin, createProduct, updateProduct, softDeleteProduct, bulkUpdateProducts,
} from "../services/admin.service.js";
import { listAdminCategories, createCategory, updateCategory } from "../services/category.service.js";
import {
  getInventorySummary, getInventoryProduct, getInventoryHistory, adjustStock,
} from "../services/inventory.service.js";
import { allowedNext } from "../services/order.service.js";
import { logAudit } from "../utils/audit.js";

export async function login(req, res) {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) throw ApiError.badRequest("CREDENTIALS_REQUIRED", "اسم المستخدم وكلمة المرور مطلوبان.");

  const db = getDb();
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?;").get(username);
  // مقارنة ثابتة الشكل حتى مع عدم وجود المستخدم (ضد التخمين بالتوقيت)
  const hash = admin ? admin.password_hash : "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!admin || !ok) throw ApiError.unauthorized("بيانات الدخول غير صحيحة.");

  const token = createSession(admin.username);
  logAudit({ actor: admin.username, action: "admin.login", entity: "admin", entityId: admin.username });
  res.json({ success: true, data: { token, username: admin.username, role: admin.role || "owner", expiresInHours: 12 } });
}

export function orders(req, res) {
  const status = req.query.status ? String(req.query.status) : undefined;
  if (status && !ORDER_STATUSES.includes(status)) {
    throw ApiError.badRequest("INVALID_STATUS", "حالة الطلب غير صحيحة.");
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = req.query.search ? String(req.query.search) : undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;
  res.json({ success: true, data: listOrders({ status, search, limit, page }) });
}

export function setOrderStatus(req, res) {
  const result = updateOrderStatus(req.params.ref, String(req.body?.status || ""), req.admin?.username);
  if (!result.unchanged) {
    logAudit({ actor: req.admin?.username, action: "order.status", entity: "order", entityId: result.orderNumber, meta: { from: result.prevStatus, to: result.status } });
  }
  res.json({ success: true, data: { ...result, allowedNext: allowedNext(result.status) } });
}

export async function telegramTest(req, res) {
  const result = await testTelegramConnection();
  res.json({ success: true, data: result });
}

export async function telegramRetry(req, res) {
  const force = req.body?.force === true;
  const result = await retryTelegramNotification(req.params.ref, { force });
  res.json({ success: true, data: result });
}

export function logout(req, res) {
  logAudit({ actor: req.admin?.username, action: "admin.logout", entity: "admin", entityId: req.admin?.username || "" });
  destroySessionByRequest(req);
  res.json({ success: true, data: { loggedOut: true } });
}

export function dashboard(req, res) {
  res.json({ success: true, data: getDashboard() });
}

export function orderDetails(req, res) {
  res.json({ success: true, data: getAdminOrderDetails(req.params.ref) });
}

export function productsList(req, res) {
  const { search, category, available, status, sort, page, limit } = req.query;
  res.json({
    success: true,
    data: listProductsAdmin({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      available: available === undefined ? undefined : available,
      status: status ? String(status) : undefined,
      sort: sort ? String(sort) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}

export function productsBulk(req, res) {
  const result = bulkUpdateProducts(req.body?.ids, req.body?.action, req.admin?.username);
  res.json({ success: true, data: result });
}

export function categoriesList(req, res) {
  res.json({ success: true, data: { categories: listAdminCategories() } });
}

export function categoryCreate(req, res) {
  const category = createCategory(req.body || {}, req.admin?.username);
  res.status(201).json({ success: true, data: category });
}

export function categoryUpdate(req, res) {
  const category = updateCategory(req.params.id, req.body || {}, req.admin?.username);
  res.json({ success: true, data: category });
}

export function inventorySummary(req, res) {
  res.json({ success: true, data: getInventorySummary() });
}

export function inventoryProduct(req, res) {
  res.json({ success: true, data: getInventoryProduct(req.params.productId) });
}

export function inventoryAdjust(req, res) {
  const result = adjustStock(req.params.productId, {
    mode: req.body?.mode,
    quantity: req.body?.quantity,
    reason: req.body?.reason,
    admin: req.admin?.username,
  });
  res.json({ success: true, data: result });
}

export function inventoryHistory(req, res) {
  const { page, limit } = req.query;
  res.json({
    success: true,
    data: getInventoryHistory(req.params.productId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}

export function productCreate(req, res) {
  const product = createProduct(req.body || {}, req.admin?.username);
  res.status(201).json({ success: true, data: product });
}

export function productUpdate(req, res) {
  const product = updateProduct(req.params.id, req.body || {}, req.admin?.username);
  res.json({ success: true, data: product });
}

export function productDelete(req, res) {
  const result = softDeleteProduct(req.params.id, req.admin?.username);
  res.json({ success: true, data: result });
}

export function customersList(req, res) {
  const { search, page, limit } = req.query;
  res.json({
    success: true,
    data: listCustomers({
      search: search ? String(search) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}

export function customerDetails(req, res) {
  res.json({ success: true, data: getCustomerDetails(req.params.id) });
}
