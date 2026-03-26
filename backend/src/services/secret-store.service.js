import crypto from "crypto";

import env from "../config/env.js";
import HttpError from "../utils/http-error.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getEncryptionKey = () =>
  crypto.createHash("sha256").update(String(env.encryptionSecret || "")).digest();

const normalizeSecretValue = (value) => String(value || "").trim();

export const encryptSecretValue = (value) => {
  const normalizedValue = normalizeSecretValue(value);

  if (!normalizedValue) {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalizedValue, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
};

export const decryptSecretValue = (value) => {
  const normalizedValue = normalizeSecretValue(value);

  if (!normalizedValue) {
    return "";
  }

  const parts = normalizedValue.split(":");

  if (parts.length !== 3) {
    return normalizedValue;
  }

  try {
    const [ivBase64, authTagBase64, encryptedBase64] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (_error) {
    throw new HttpError(500, "Impossible de dechiffrer une configuration sensible.");
  }
};

export const maskSensitiveValue = (value, { start = 4, end = 4 } = {}) => {
  const normalizedValue = normalizeSecretValue(value);

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length <= start + end) {
    return `${normalizedValue.slice(0, Math.min(2, normalizedValue.length))}****`;
  }

  return `${normalizedValue.slice(0, start)}****${normalizedValue.slice(-end)}`;
};
