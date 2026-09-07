import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { limitTrack } from "../middleware/rate-limit.middleware.js";
import { create, track } from "../controllers/orders.controller.js";

const router = Router();

router.post("/", asyncHandler(create));
// تتبع الضيف: رقم طلب + هاتف مطابق (لا كشف برقم الطلب وحده أبدًا)
router.post("/track", limitTrack, asyncHandler(track));

export default router;
