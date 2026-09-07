// ==========================================================================
// Recommendation Controller — توصيات عامة (منتجات فقط — بلا بيانات عملاء)
// ==========================================================================
import { getRecommendations } from "../services/recommendation.service.js";

export function recommendations(req, res) {
  const q = req.query || {};
  const cartIds = q.cartProductIds
    ? String(q.cartProductIds).split(",").map((v) => v.trim()).filter(Boolean).slice(0, 30)
    : [];
  res.json({
    success: true,
    data: getRecommendations({
      customerPhone: q.customerPhone ? String(q.customerPhone).trim().slice(0, 20) : undefined,
      cartIds,
      category: q.category ? String(q.category).slice(0, 40) : undefined,
      limit: q.limit,
    }),
  });
}
