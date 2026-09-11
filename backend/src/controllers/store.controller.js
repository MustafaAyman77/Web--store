// ==========================================================================
// Store Controller — الإعدادات العامة للمتجر + مناطق التوصيل (عام، آمن)
// لا تُعاد أي أسرار أو بيانات داخلية — النسخة العامة فقط.
// ==========================================================================
import { getPublicStore, listPublicZones } from "../services/settings.service.js";

export function publicStore(_req, res) {
  res.json({ success: true, data: getPublicStore() });
}

export function publicZones(_req, res) {
  res.json({ success: true, data: { zones: listPublicZones() } });
}
