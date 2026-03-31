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

const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const vercelEnv = String(process.env.VERCEL_ENV || "")
  .trim()
  .toLowerCase();
const nodeEnv = String(process.env.NODE_ENV || "development")
  .trim()
  .toLowerCase();
const isProductionRuntime = nodeEnv === "production" || vercelEnv === "production";

const hasExplicitEnv = (name) => String(process.env[name] || "").trim().length > 0;

const assertProductionRequirement = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  vercelEnv,
  isProductionRuntime,
  clientUrl: process.env.CLIENT_URL || "http://localhost:3001",
  clientUrls: Array.from(
    new Set([
      process.env.CLIENT_URL || "http://localhost:3001",
      ...parseList(process.env.CLIENT_URLS),
    ])
  ),
  clientUrlPatterns: parseList(process.env.CLIENT_URL_PATTERNS),
  allowVercelPreviewOrigins: parseBoolean(
    process.env.ALLOW_VERCEL_PREVIEW_ORIGINS,
    vercelEnv === "preview"
  ),
  vercelFrontendProjectName: String(process.env.VERCEL_FRONTEND_PROJECT_NAME || "")
    .trim()
    .toLowerCase(),
  databaseMode: String(process.env.DATABASE_MODE || "memory").toLowerCase(),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  databaseSslRejectUnauthorized: parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    isProductionRuntime
  ),
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
  inseeApiKey: process.env.INSEE_API_KEY || "",
  inseeClientId: process.env.INSEE_CLIENT_ID || "",
  inseeClientSecret: process.env.INSEE_CLIENT_SECRET || "",
  inseeApiBaseUrl:
    process.env.INSEE_API_BASE_URL || "https://api.insee.fr/api-sirene/3.11",
  inseeTokenUrl: process.env.INSEE_TOKEN_URL || "https://api.insee.fr/token",
  inseeTimeoutMs: Number(process.env.INSEE_TIMEOUT_MS || 8000),
  mailTransportMode: String(process.env.MAIL_TRANSPORT_MODE || "log")
    .trim()
    .toLowerCase(),
  mailFrom: process.env.MAIL_FROM || "Lokify <no-reply@lokify.app>",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  r2AccountId: String(process.env.R2_ACCOUNT_ID || "").trim(),
  r2AccessKeyId: String(process.env.R2_ACCESS_KEY_ID || "").trim(),
  r2SecretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || "").trim(),
  r2Bucket: String(process.env.R2_BUCKET || "lokify-images").trim(),
  r2PublicBaseUrl: normalizeUrl(process.env.R2_PUBLIC_BASE_URL),
  r2Region: String(process.env.R2_REGION || "auto").trim() || "auto",
  r2Endpoint:
    normalizeUrl(process.env.R2_ENDPOINT) ||
    (String(process.env.R2_ACCOUNT_ID || "").trim()
      ? `https://${String(process.env.R2_ACCOUNT_ID || "").trim()}.r2.cloudflarestorage.com`
      : ""),
  cronSecret: process.env.CRON_SECRET || "",
  passwordResetBaseUrl:
    process.env.PASSWORD_RESET_BASE_URL ||
    `${process.env.CLIENT_URL || "http://localhost:3001"}/reset-password`,
  passwordResetTokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 120),
};

if (env.isProductionRuntime) {
  assertProductionRequirement(
    hasExplicitEnv("CLIENT_URL") && !/localhost/i.test(env.clientUrl),
    "CLIENT_URL doit etre defini vers l'URL publique en production."
  );
  assertProductionRequirement(
    env.databaseMode === "postgres",
    "DATABASE_MODE doit etre positionne sur 'postgres' en production."
  );
  assertProductionRequirement(
    Boolean(env.databaseUrl),
    "DATABASE_URL doit etre defini en production."
  );
  assertProductionRequirement(
    hasExplicitEnv("JWT_SECRET") && env.jwtSecret !== "change-me-lokify",
    "JWT_SECRET doit etre defini explicitement avec une valeur forte en production."
  );
  assertProductionRequirement(
    hasExplicitEnv("ENCRYPTION_SECRET") && env.encryptionSecret !== "change-me-lokify",
    "ENCRYPTION_SECRET doit etre defini explicitement avec une valeur forte en production."
  );
  assertProductionRequirement(
    hasExplicitEnv("LOKIFY_SUPER_ADMIN_EMAIL"),
    "LOKIFY_SUPER_ADMIN_EMAIL doit etre defini explicitement en production."
  );
  assertProductionRequirement(
    hasExplicitEnv("LOKIFY_SUPER_ADMIN_PASSWORD") && env.lokifySuperAdminPassword !== "admin",
    "LOKIFY_SUPER_ADMIN_PASSWORD doit etre defini explicitement avec une valeur forte en production."
  );
  assertProductionRequirement(
    hasExplicitEnv("CRON_SECRET"),
    "CRON_SECRET doit etre defini explicitement en production pour securiser la purge d'archivage."
  );
}

export default env;
