import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { listProducts, getProductById } from "../controllers/products.controller.js";

const router = Router();

router.get("/", asyncHandler(listProducts));
router.get("/:id", asyncHandler(getProductById));

export default router;
