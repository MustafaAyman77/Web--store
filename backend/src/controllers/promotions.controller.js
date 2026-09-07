// ==========================================================================
// Promotions Controller — العامة ترى النشطة فقط؛ الإدارة تدير الكل.
// ==========================================================================
import {
  listActivePromotions, getActivePromotion, listAdminPromotions, getAdminPromotion,
  createPromotion, updatePromotion, setPromotionEnabled, deletePromotion,
} from "../services/promotion.service.js";
import { logAudit } from "../utils/audit.js";

/* ---------- عام ---------- */

export function publicList(_req, res) {
  res.json({ success: true, data: { promotions: listActivePromotions() } });
}

export function publicGet(req, res) {
  res.json({ success: true, data: getActivePromotion(req.params.id) });
}

/* ---------- إدارة ---------- */

export function adminList(req, res) {
  const { status, page, limit } = req.query || {};
  res.json({ success: true, data: listAdminPromotions({ status, page, limit }) });
}

export function adminGet(req, res) {
  res.json({ success: true, data: getAdminPromotion(req.params.id) });
}

export function adminCreate(req, res) {
  const promo = createPromotion(req.body || {});
  logAudit({ actor: req.admin?.username, action: "promo.create", entity: "promotion", entityId: promo.id, meta: { name: promo.name } });
  res.status(201).json({ success: true, data: promo });
}

export function adminUpdate(req, res) {
  const promo = updatePromotion(req.params.id, req.body || {});
  logAudit({ actor: req.admin?.username, action: "promo.update", entity: "promotion", entityId: promo.id, meta: {} });
  res.json({ success: true, data: promo });
}

export function adminEnable(req, res) {
  const promo = setPromotionEnabled(req.params.id, true);
  logAudit({ actor: req.admin?.username, action: "promo.enable", entity: "promotion", entityId: promo.id, meta: {} });
  res.json({ success: true, data: promo });
}

export function adminDisable(req, res) {
  const promo = setPromotionEnabled(req.params.id, false);
  logAudit({ actor: req.admin?.username, action: "promo.disable", entity: "promotion", entityId: promo.id, meta: {} });
  res.json({ success: true, data: promo });
}

export function adminDelete(req, res) {
  const result = deletePromotion(req.params.id);
  logAudit({ actor: req.admin?.username, action: result.deleted ? "promo.delete" : "promo.disable", entity: "promotion", entityId: req.params.id, meta: result });
  res.json({ success: true, data: result });
}
