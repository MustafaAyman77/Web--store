// ==========================================================================
// Search Controller — البحث الذكي العام + تحليلات الإدارة.
// ==========================================================================
import { runSearch, getSuggestions, getPopularSearches, getSearchAnalytics } from "../services/search.service.js";

function customerIdOf(req) {
  return (req.customer && req.customer.id) || null;
}

export function search(req, res) {
  res.json({ success: true, data: runSearch(req.query || {}, customerIdOf(req)) });
}

export function suggestions(req, res) {
  const q = String(req.query?.q ?? "");
  const limit = req.query?.limit;
  res.json({ success: true, data: { query: q.slice(0, 100), suggestions: getSuggestions(q, limit) } });
}

export function popular(req, res) {
  res.json({ success: true, data: { searches: getPopularSearches(req.query?.limit) } });
}

export function adminAnalytics(_req, res) {
  res.json({ success: true, data: getSearchAnalytics() });
}
