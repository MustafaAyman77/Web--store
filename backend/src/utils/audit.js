// ==========================================================================
// سجل التدقيق (Audit Foundation) — من فعل ماذا ومتى؟
// يُستخدم للعمليات الإدارية (حالة طلب/منتج/دخول) — لا يُفشل أي عملية أبدًا.
// ==========================================================================
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/database.js";

export function logAudit({ actor, action, entity, entityId, meta }) {
  try {
    getDb()
      .prepare(
        "INSERT INTO audit_logs (id, admin_username, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?, ?);"
      )
      .run(
        uuidv4(),
        actor || "system",
        action || "",
        entity || "",
        entityId || "",
        meta ? JSON.stringify(meta).slice(0, 2000) : null
      );
  } catch {
    /* التدقيق مساعد فقط — لا يُفشل العملية */
  }
}

export default { logAudit };
