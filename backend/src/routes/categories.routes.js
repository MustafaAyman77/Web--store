import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { listPublicCategories } from "../services/category.service.js";

const router = Router();

// الأقسام النشطة للواجهة العامة — مرتبة
router.get("/", asyncHandler(async (req, res) => {
  res.json({ success: true, data: { categories: listPublicCategories() } });
}));

export default router;
