import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  login, logout, dashboard, orders, orderDetails, setOrderStatus, telegramTest, telegramRetry,
  productsList, productCreate, productUpdate, productDelete, customersList, customerDetails,
} from "../controllers/admin.controller.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/logout", requireAdmin, asyncHandler(logout));
router.get("/dashboard", requireAdmin, asyncHandler(dashboard));
router.get("/orders/:ref", requireAdmin, asyncHandler(orderDetails));
router.get("/products", requireAdmin, asyncHandler(productsList));
router.post("/products", requireAdmin, asyncHandler(productCreate));
router.patch("/products/:id", requireAdmin, asyncHandler(productUpdate));
router.delete("/products/:id", requireAdmin, asyncHandler(productDelete));
router.get("/customers", requireAdmin, asyncHandler(customersList));
router.get("/customers/:id", requireAdmin, asyncHandler(customerDetails));
router.post("/telegram/test", requireAdmin, asyncHandler(telegramTest));
router.post("/orders/:ref/telegram/retry", requireAdmin, asyncHandler(telegramRetry));
router.get("/orders", requireAdmin, asyncHandler(orders));
router.patch("/orders/:ref/status", requireAdmin, asyncHandler(setOrderStatus));

export default router;
