import cors from "cors";
import express from "express";

import env from "./config/env.js";
import { buildCorsOriginChecker } from "./lib/cors-origin.js";
import { authMiddleware } from "./middleware/auth.js";
import { requireProviderRole, requireSuperAdmin } from "./middleware/role-guard.js";
import { errorHandler } from "./middleware/error-handler.js";
import { subscriptionAccessGuard } from "./middleware/subscription-access.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import clientsRoutes from "./routes/clients.routes.js";
import companyRoutes from "./routes/company.routes.js";
import customerPaymentsRoutes from "./routes/customer-payments.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import deliveriesRoutes from "./routes/deliveries.routes.js";
import domainEventsRoutes from "./routes/domain-events.routes.js";
import itemsRoutes from "./routes/items.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import lokifyBillingRoutes from "./routes/lokify-billing.routes.js";
import lokifyBillingWebhookRoutes from "./routes/lokify-billing-webhooks.routes.js";
import operationsRoutes from "./routes/operations.routes.js";
import planningRoutes from "./routes/planning.routes.js";
import publicStorefrontRoutes from "./routes/public-storefront.routes.js";
import reportingRoutes from "./routes/reporting.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";
import storefrontRoutes from "./routes/storefront.routes.js";
import supportRoutes from "./routes/support.routes.js";

const app = express();
app.disable("x-powered-by");

const isAllowedCorsOrigin = buildCorsOriginChecker({
  clientUrls: env.clientUrls,
  clientUrlPatterns: env.clientUrlPatterns,
  allowLocalDevelopmentOrigins: !env.isProductionRuntime,
  allowVercelPreviewOrigins: env.allowVercelPreviewOrigins,
  vercelEnv: env.vercelEnv,
  vercelFrontendProjectName: env.vercelFrontendProjectName,
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=()"
  );
  next();
});
app.use("/api/lokify-billing/webhooks", lokifyBillingWebhookRoutes);
app.use("/api/internal", internalRoutes);
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/public/storefront", publicStorefrontRoutes);
app.use("/api/admin", authMiddleware, requireSuperAdmin, adminRoutes);
app.use("/api/domain-events", authMiddleware, domainEventsRoutes);
app.use("/api/lokify-billing", authMiddleware, requireProviderRole, lokifyBillingRoutes);
app.use(
  "/api/customer-payments",
  authMiddleware,
  requireProviderRole,
  customerPaymentsRoutes
);
app.use("/api/support", authMiddleware, supportRoutes);
app.use(
  "/api/catalog",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  catalogRoutes
);
app.use(
  "/api/dashboard",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  dashboardRoutes
);
app.use(
  "/api/deliveries",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  deliveriesRoutes
);
app.use(
  "/api/clients",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  clientsRoutes
);
app.use(
  "/api/items",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  itemsRoutes
);
app.use(
  "/api/reservations",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  reservationsRoutes
);
app.use(
  "/api/operations",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  operationsRoutes
);
app.use(
  "/api/planning",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  planningRoutes
);
app.use(
  "/api/reporting",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  reportingRoutes
);
app.use(
  "/api/storefront",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  storefrontRoutes
);

app.use((_req, res) => {
  res.status(404).json({ message: "Route introuvable." });
});

app.use(errorHandler);

export default app;
