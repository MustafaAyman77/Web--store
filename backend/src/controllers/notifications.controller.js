// ==========================================================================
// Notifications Controller — إشعارات العميل نفسه (من الجلسة فقط)
// العميل لا ينشئ إشعارات ولا يقرأ/يعدّل إشعارات غيره — القراءة والتعديل
// مقيّدان دائمًا بـ req.customer.id.
// ==========================================================================
import {
  listNotifications, unreadCount, markRead, markAllRead,
} from "../services/notification.service.js";

export function list(req, res) {
  const { page, limit } = req.query || {};
  res.json({
    success: true,
    data: listNotifications(req.customer.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  });
}

export function count(req, res) {
  res.json({ success: true, data: { count: unreadCount(req.customer.id) } });
}

export function read(req, res) {
  res.json({ success: true, data: markRead(req.customer.id, req.params.id) });
}

export function readAll(req, res) {
  res.json({ success: true, data: markAllRead(req.customer.id) });
}
