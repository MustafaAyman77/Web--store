import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";
import { search, suggestions, popular } from "../controllers/search.controller.js";

const router = Router();

// الاقتراحات تُضرب مع كل حرف — حد مريح؛ البحث الكامل أضيق
const ipOf = (req) => String(req.ip || req.socket?.remoteAddress || "unknown");
const limitSearch = createRateLimiter({
  windowMs: 60 * 1000, max: 60, key: (req) => "search:" + ipOf(req),
  code: "RATE_LIMITED", message: "طلبات كثيرة — انتظر قليلًا وحاول مجددًا.",
});
const limitSuggest = createRateLimiter({
  windowMs: 60 * 1000, max: 180, key: (req) => "suggest:" + ipOf(req),
  code: "RATE_LIMITED", message: "طلبات كثيرة — انتظر قليلًا وحاول مجددًا.",
});

router.get("/", limitSearch, asyncHandler(search));
router.get("/suggestions", limitSuggest, asyncHandler(suggestions));
router.get("/popular", limitSuggest, asyncHandler(popular));

export default router;
