// ==========================================================================
// أسواق البسيط — Express App
// API + تقديم الواجهة (frontend) من نفس السيرفر → نفس الـ Origin (بدون CORS
// issues) مع دعم Origins إضافية عبر ALLOWED_ORIGINS عند فتح الواجهة منفصلة.
// ==========================================================================
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { securityHeaders } from "./middleware/security.middleware.js";
import { attachCustomer } from "./middleware/customer-auth.middleware.js";
import productsRoutes from "./routes/products.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import customersRoutes from "./routes/customers.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import authRoutes from "./routes/auth.routes.js";
import meRoutes from "./routes/me.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..", "..", "frontend");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "256kb" }));

  // CORS: نفس الـ Origin دائمًا مسموح + Origins إضافية من الإعدادات
  const extraOrigins = env.allowedOrigins;
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / apps
      if (env.isDev || extraOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed"));
    },
  }));

  // ---------- Public API ----------
  app.get("/api/health", (req, res) => {
    res.json({ success: true, status: "ok", environment: env.nodeEnv });
  });

  // إعدادات عامة للواجهة — ⚠️ بدون أي أسرار
  app.get("/api/config", (req, res) => {
    res.json({
      success: true,
      data: {
        deliveryEnabled: env.delivery.enabled,
        store: { name: "أسواق البسيط", currency: "ج.م" },
      },
    });
  });

  app.use("/api/products", productsRoutes);
  app.use("/api/orders", ordersRoutes);
  app.use("/api/customers", customersRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/recommendations", attachCustomer, recommendationsRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/me", attachCustomer, meRoutes);
  app.use("/api/admin", adminRoutes);

  // ---------- لوحة التحكم (SPA — كل مسارات /admin تخدم index.html) ----------
  app.get("/admin*", (req, res, next) => {
    if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next(); // ملفات css/js الفعلية
    res.sendFile(path.join(FRONTEND_DIR, "admin", "index.html"));
  });

  // ---------- Frontend (يُقدَّم من نفس السيرفر) ----------
  app.use(express.static(FRONTEND_DIR, { extensions: ["html"] }));
  app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}

export default createApp;
