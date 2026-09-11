import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { limitTrack } from "../middleware/rate-limit.middleware.js";
import { create, track, quote } from "../controllers/orders.controller.js";

const router = Router();

router.post("/", asyncHandler(create));
// عرض سعر للـCheckout — نفس حساب الإنشاء، بدون حفظ
router.post("/quote", limitTrack, asyncHandler(quote));
// تتبع الضيف: رقم طلب + هاتف مطابق (لا كشف برقم الطلب وحده أبدًا)
router.post("/track", limitTrack, asyncHandler(track));

export default router;
