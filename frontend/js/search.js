/* ==========================================================================
   أسواق البسيط — Search (عميل البحث الذكي + آخر عمليات البحث)
   --------------------------------------------------------------------------
   - البحث والترتيب والترشيح في الـBackend — هنا UI فقط + سجل محلي.
   - السجل المحلي (basitMarket_recentSearches) لا يُرسل للسيرفر أبدًا —
     يُرسل الاستعلام الحالي فقط عند تنفيذ بحث فعلي.
   ========================================================================== */
(function (global) {
  "use strict";

  const RECENT_KEY = "basitMarket_recentSearches";
  const RECENT_MAX = 10;

  function base() {
    try {
      return String((global.BasitConfig.api && global.BasitConfig.api.baseUrl) || "").replace(/\/$/, "");
    } catch (e) { return ""; }
  }

  async function backendReady() {
    try {
      const Api = global.Basit && global.Basit.Api;
      if (!Api) return false;
      return (await Api.resolveMode()) === "backend";
    } catch (e) { return false; }
  }

  async function fetchJson(path) {
    const res = await fetch(base() + path, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      const err = new Error((data && data.error && data.error.message) || "تعذر إتمام البحث.");
      err.code = data && data.error && data.error.code;
      err.status = res.status;
      throw err;
    }
    return data.data;
  }

  /** بحث كامل — الترشيح والترتيب والصفحات من السيرفر */
  async function query(params) {
    const q = new URLSearchParams();
    q.set("q", String(params.q || ""));
    if (params.category && params.category !== "all") q.set("category", params.category);
    if (params.minPrice !== "" && params.minPrice !== null && params.minPrice !== undefined) q.set("minPrice", params.minPrice);
    if (params.maxPrice !== "" && params.maxPrice !== null && params.maxPrice !== undefined) q.set("maxPrice", params.maxPrice);
    if (params.available) q.set("available", "1");
    if (params.offer) q.set("offer", "1");
    if (params.sort) q.set("sort", params.sort);
    q.set("page", params.page || 1);
    q.set("limit", params.limit || 20);
    return fetchJson("/api/search?" + q.toString());
  }

  async function suggest(text, limit) {
    const q = new URLSearchParams({ q: String(text || "") });
    if (limit) q.set("limit", limit);
    const d = await fetchJson("/api/search/suggestions?" + q.toString());
    return d.suggestions || [];
  }

  let popularCache = null;
  async function popular() {
    if (popularCache) return popularCache;
    try {
      const d = await fetchJson("/api/search/popular?limit=8");
      popularCache = d.searches || [];
    } catch (e) { popularCache = []; }
    return popularCache;
  }

  /* ================= آخر عمليات البحث (محلي فقط) ================= */

  function getRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
    } catch (e) { return []; }
  }

  function saveRecent(text) {
    text = String(text || "").trim().slice(0, 60);
    if (text.length < 2) return;
    try {
      const list = [text].concat(getRecent().filter((x) => x !== text)).slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* تجاهل */ }
  }

  function clearRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* تجاهل */ }
  }

  global.Basit = global.Basit || {};
  global.Basit.Search = { backendReady, query, suggest, popular, getRecent, saveRecent, clearRecent };
})(window);
