import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { recommendations } from "../controllers/recommendation.controller.js";

const router = Router();

// GET /api/recommendations?customerPhone=&cartProductIds=a,b&category=&limit=
router.get("/", asyncHandler(recommendations));

export default router;
