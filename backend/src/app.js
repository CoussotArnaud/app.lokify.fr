import cors from "cors";
import express from "express";

import env from "./config/env.js";
import { authMiddleware } from "./middleware/auth.js";
import { requireProviderRole, requireSuperAdmin } from "./middleware/role-guard.js";
import { errorHandler } from "./middleware/error-handler.js";
import { subscriptionAccessGuard } from "./middleware/subscription-access.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import clientsRoutes from "./routes/clients.routes.js";
import customerPaymentsRoutes from "./routes/customer-payments.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import itemsRoutes from "./routes/items.routes.js";
import lokifyBillingRoutes from "./routes/lokify-billing.routes.js";
import lokifyBillingWebhookRoutes from "./routes/lokify-billing-webhooks.routes.js";
import planningRoutes from "./routes/planning.routes.js";
import reservationsRoutes from "./routes/reservations.routes.js";

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use("/api/lokify-billing/webhooks", lokifyBillingWebhookRoutes);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", authMiddleware, requireSuperAdmin, adminRoutes);
app.use("/api/lokify-billing", authMiddleware, requireProviderRole, lokifyBillingRoutes);
app.use(
  "/api/customer-payments",
  authMiddleware,
  requireProviderRole,
  customerPaymentsRoutes
);
app.use(
  "/api/dashboard",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  dashboardRoutes
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
  "/api/planning",
  authMiddleware,
  requireProviderRole,
  subscriptionAccessGuard,
  planningRoutes
);

app.use((_req, res) => {
  res.status(404).json({ message: "Route introuvable." });
});

app.use(errorHandler);

export default app;
