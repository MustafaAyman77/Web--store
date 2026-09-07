import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireCustomer } from "../middleware/customer-auth.middleware.js";
import { me, myOrders, myOrder, updateProfile, deactivate } from "../controllers/me.controller.js";

const router = Router();

router.use(requireCustomer);

router.get("/", asyncHandler(me));
router.get("/orders", asyncHandler(myOrders));
router.get("/orders/:orderNumber", asyncHandler(myOrder));
router.patch("/profile", asyncHandler(updateProfile));
router.post("/deactivate", asyncHandler(deactivate));

export default router;
