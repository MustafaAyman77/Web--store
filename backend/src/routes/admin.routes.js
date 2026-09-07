import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import {
  login, logout, dashboard, orders, orderDetails, setOrderStatus, telegramTest, telegramRetry,
  productsList, productCreate, productUpdate, productDelete, productsBulk, customersList, customerDetails,
  categoriesList, categoryCreate, categoryUpdate,
  inventorySummary, inventoryProduct, inventoryAdjust, inventoryHistory,
  customerUpdate, storeSettings, storeSettingsUpdate,
  zonesList, zoneCreate, zoneUpdate, zoneDelete,
} from "../controllers/admin.controller.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/logout", requireAdmin, asyncHandler(logout));
router.get("/dashboard", requireAdmin, asyncHandler(dashboard));
router.get("/orders/:ref", requireAdmin, asyncHandler(orderDetails));
router.get("/products", requireAdmin, asyncHandler(productsList));
router.post("/products", requireAdmin, asyncHandler(productCreate));
router.patch("/products/bulk", requireAdmin, asyncHandler(productsBulk));
router.patch("/products/:id", requireAdmin, asyncHandler(productUpdate));
router.get("/categories", requireAdmin, asyncHandler(categoriesList));
router.post("/categories", requireAdmin, asyncHandler(categoryCreate));
router.patch("/categories/:id", requireAdmin, asyncHandler(categoryUpdate));
router.get("/inventory", requireAdmin, asyncHandler(inventorySummary));
router.get("/inventory/:productId", requireAdmin, asyncHandler(inventoryProduct));
router.post("/inventory/:productId/adjust", requireAdmin, asyncHandler(inventoryAdjust));
router.get("/inventory/:productId/history", requireAdmin, asyncHandler(inventoryHistory));
router.delete("/products/:id", requireAdmin, asyncHandler(productDelete));
router.get("/customers", requireAdmin, asyncHandler(customersList));
router.get("/customers/:id", requireAdmin, asyncHandler(customerDetails));
router.patch("/customers/:id", requireAdmin, asyncHandler(customerUpdate));
router.post("/telegram/test", requireAdmin, asyncHandler(telegramTest));
router.post("/orders/:ref/telegram/retry", requireAdmin, asyncHandler(telegramRetry));
router.get("/orders", requireAdmin, asyncHandler(orders));
router.patch("/orders/:ref/status", requireAdmin, asyncHandler(setOrderStatus));
router.get("/settings/store", requireAdmin, asyncHandler(storeSettings));
router.patch("/settings/store", requireAdmin, asyncHandler(storeSettingsUpdate));
router.get("/delivery-zones", requireAdmin, asyncHandler(zonesList));
router.post("/delivery-zones", requireAdmin, asyncHandler(zoneCreate));
router.patch("/delivery-zones/:id", requireAdmin, asyncHandler(zoneUpdate));
router.delete("/delivery-zones/:id", requireAdmin, asyncHandler(zoneDelete));

export default router;
