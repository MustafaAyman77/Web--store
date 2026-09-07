import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { login, orders, setOrderStatus, telegramTest, telegramRetry } from "../controllers/admin.controller.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/telegram/test", requireAdmin, asyncHandler(telegramTest));
router.post("/orders/:ref/telegram/retry", requireAdmin, asyncHandler(telegramRetry));
router.get("/orders", requireAdmin, asyncHandler(orders));
router.patch("/orders/:ref/status", requireAdmin, asyncHandler(setOrderStatus));

export default router;
