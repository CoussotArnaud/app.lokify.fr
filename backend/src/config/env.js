import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const currentFilePath = fileURLToPath(import.meta.url);
const configDir = path.dirname(currentFilePath);
const backendRoot = path.resolve(configDir, "..", "..");

dotenv.config({
  path: path.join(backendRoot, ".env"),
});

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:3001",
  databaseMode: String(process.env.DATABASE_MODE || "memory").toLowerCase(),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  databaseHost: process.env.DATABASE_HOST || "localhost",
  databasePort: Number(process.env.DATABASE_PORT || 5432),
  databaseUser: process.env.DATABASE_USER || "postgres",
  databasePassword: process.env.DATABASE_PASSWORD || "postgres",
  databaseName: process.env.DATABASE_NAME || "lokify",
  jwtSecret: process.env.JWT_SECRET || "change-me-lokify",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  encryptionSecret:
    process.env.ENCRYPTION_SECRET || process.env.LOKIFY_ENCRYPTION_SECRET || process.env.JWT_SECRET || "change-me-lokify",
  lokifySuperAdminEmail: String(
    process.env.LOKIFY_SUPER_ADMIN_EMAIL || process.env.LOKIFY_OWNER_EMAIL || "team@lokify.fr"
  )
    .trim()
    .toLowerCase(),
  lokifySuperAdminPassword: process.env.LOKIFY_SUPER_ADMIN_PASSWORD || "admin",
  lokifyBillingEnvironment: String(process.env.LOKIFY_BILLING_ENVIRONMENT || "test")
    .trim()
    .toLowerCase(),
  lokifyStripeTestSecretKey: process.env.LOKIFY_STRIPE_TEST_SECRET_KEY || "",
  lokifyStripeTestWebhookSecret: process.env.LOKIFY_STRIPE_TEST_WEBHOOK_SECRET || "",
  lokifyStripeTestPublishableKey: process.env.LOKIFY_STRIPE_TEST_PUBLISHABLE_KEY || "",
  mailTransportMode: String(process.env.MAIL_TRANSPORT_MODE || "log")
    .trim()
    .toLowerCase(),
  mailFrom: process.env.MAIL_FROM || "Lokify <no-reply@lokify.app>",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  passwordResetBaseUrl:
    process.env.PASSWORD_RESET_BASE_URL ||
    `${process.env.CLIENT_URL || "http://localhost:3001"}/reset-password`,
  passwordResetTokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 120),
};

export default env;
