// ==========================================================================
// Security Headers خفيفة (بدون مكتبات خارجية)
// ملاحظة مقصودة: لا يوجد X-Frame-Options هنا حتى لا ينكسر عرض المعاينة
// داخل iframe — يُفعَّل من الـ Reverse Proxy في Production الحقيقي.
// ==========================================================================

export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
}
