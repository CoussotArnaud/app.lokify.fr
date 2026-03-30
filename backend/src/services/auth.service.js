import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { query } from "../config/db.js";
import env from "../config/env.js";
import {
  ensureUserSettingsRecords,
  getUserAccountProfile,
} from "./account-profile.service.js";
import {
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "./password-reset.service.js";
import HttpError from "../utils/http-error.js";
import { isValidSiret, normalizeSiret } from "../utils/siret.js";
import {
  getVerifiedCompanyIdentity,
  previewSiretVerification,
} from "./insee-sirene.service.js";

const normalizeText = (value) => String(value || "").trim();
const coalesceText = (...values) => values.map(normalizeText).find(Boolean) || null;
const normalizedSuperAdminEmail = String(env.lokifySuperAdminEmail || "").trim().toLowerCase();
const isArchivedProviderAccount = (user) =>
  user?.account_role === "provider" && Boolean(user?.archived_at);

const assertProviderAccountNotArchived = (user) => {
  if (isArchivedProviderAccount(user)) {
    throw new HttpError(
      403,
      "Ce compte prestataire est archive. Restaurez-le depuis le back-office avant toute reconnexion."
    );
  }
};

const buildToken = (userId, authContext = {}) =>
  jwt.sign(
    {
      sub: userId,
      sessionProfile: authContext.sessionProfile || "standard",
      displayEmail: authContext.displayEmail || null,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
    }
  );

const ensureSuperAdminPlatformSettings = async (userId) => {
  if (!userId) {
    return;
  }

  await query(
    `
      INSERT INTO super_admin_stripe_settings (
        settings_key,
        subscription_price_ids_json,
        updated_by
      )
      VALUES ('platform', '{}', $1)
      ON CONFLICT (settings_key) DO NOTHING
    `,
    [userId]
  );
};

export const ensureSuperAdminAccount = async () => {
  if (!normalizedSuperAdminEmail) {
    return null;
  }

  const passwordHash = await bcrypt.hash(env.lokifySuperAdminPassword, 10);
  const { rows } = await query(
    `
      SELECT id, full_name, password_hash, account_role, provider_status
      , archived_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedSuperAdminEmail]
  );
  const existingUser = rows[0];

  if (!existingUser) {
    const userId = crypto.randomUUID();

    await query(
      `
        INSERT INTO users (
          id,
          full_name,
          email,
          password_hash,
          account_role,
          provider_status
        )
        VALUES ($1, 'Admin Lokify', $2, $3, 'super_admin', 'active')
      `,
      [userId, normalizedSuperAdminEmail, passwordHash]
    );

    await ensureUserSettingsRecords(userId);
    await ensureSuperAdminPlatformSettings(userId);

    return userId;
  }

  const nextFullName = normalizeText(existingUser.full_name) || "Admin Lokify";
  const currentPasswordHash = normalizeText(existingUser.password_hash);
  const currentPasswordMatchesConfiguredPassword = currentPasswordHash
    ? await bcrypt.compare(env.lokifySuperAdminPassword, currentPasswordHash)
    : false;
  const nextPasswordHash =
    currentPasswordHash && currentPasswordMatchesConfiguredPassword
      ? currentPasswordHash
      : passwordHash;
  const needsUpdate =
    existingUser.account_role !== "super_admin" ||
    existingUser.provider_status !== "active" ||
    nextFullName !== existingUser.full_name ||
    nextPasswordHash !== existingUser.password_hash;

  if (needsUpdate) {
    await query(
      `
        UPDATE users
        SET
          full_name = $2,
          password_hash = $3,
          account_role = 'super_admin',
          provider_status = 'active'
        WHERE id = $1
      `,
      [existingUser.id, nextFullName, nextPasswordHash]
    );
  }

  await ensureUserSettingsRecords(existingUser.id);
  await ensureSuperAdminPlatformSettings(existingUser.id);

  return existingUser.id;
};

export const registerUser = async ({
  first_name,
  last_name,
  company_name,
  siret,
  commercial_name,
  address,
  postal_code,
  city,
  ape_code,
  siren,
  email,
  password,
}) => {
  const normalizedFirstName = normalizeText(first_name);
  const normalizedLastName = normalizeText(last_name);
  const normalizedCompanyName = normalizeText(company_name);
  const normalizedSiret = normalizeSiret(siret);

  if (!normalizedFirstName) {
    throw new HttpError(400, "Le prenom est obligatoire.");
  }

  if (!normalizedLastName) {
    throw new HttpError(400, "Le nom est obligatoire.");
  }

  if (!normalizedCompanyName) {
    throw new HttpError(400, "Le nom de la societe est obligatoire.");
  }

  if (!normalizedSiret) {
    throw new HttpError(400, "Le numero de SIRET est obligatoire.");
  }

  if (!isValidSiret(normalizedSiret)) {
    throw new HttpError(400, "Le numero de SIRET est invalide.");
  }

  if (!email?.trim()) {
    throw new HttpError(400, "L'email est obligatoire.");
  }

  if (!password || password.length < 6) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 6 caracteres.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);

  if (existingUser.rows[0]) {
    const archivedConflict = await query(
      "SELECT archived_at FROM users WHERE id = $1 LIMIT 1",
      [existingUser.rows[0].id]
    );
    throw new HttpError(
      409,
      archivedConflict.rows[0]?.archived_at
        ? "Un compte prestataire archive existe deja avec cet email. Restaurez-le au lieu d'en creer un nouveau."
        : "Un utilisateur avec cet email existe deja."
    );
  }

  const existingSiret = await query(
    "SELECT id, archived_at FROM users WHERE siret = $1 AND account_role = 'provider' LIMIT 1",
    [normalizedSiret]
  );

  if (existingSiret.rows[0]) {
    throw new HttpError(
      409,
      existingSiret.rows[0].archived_at
        ? "Un compte prestataire archive existe deja avec ce SIRET. Restaurez-le au lieu d'en creer un nouveau."
        : "Un compte prestataire avec ce SIRET existe deja."
    );
  }

  const verifiedCompanyIdentity = await getVerifiedCompanyIdentity(normalizedSiret);
  const verifiedCompany = verifiedCompanyIdentity.company || null;
  const normalizedCommercialName = coalesceText(
    commercial_name,
    verifiedCompany?.commercialName
  );
  const normalizedAddress = coalesceText(address, verifiedCompany?.address);
  const normalizedPostalCode = coalesceText(postal_code, verifiedCompany?.postalCode);
  const normalizedCity = coalesceText(city, verifiedCompany?.city);
  const normalizedApeCode = coalesceText(ape_code, verifiedCompany?.apeCode);
  const normalizedSiren = coalesceText(siren, verifiedCompany?.siren);
  const normalizedEstablishmentStatus = coalesceText(
    verifiedCompany?.establishmentStatus
  );

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  const { rows } = await query(
    `
      INSERT INTO users (
        id,
        full_name,
        company_name,
        siret,
        siren,
        commercial_name,
        first_name,
        last_name,
        email,
        password_hash,
        account_role,
        provider_status,
        address,
        postal_code,
        city,
        ape_code,
        establishment_admin_status,
        sirene_verification_status,
        sirene_verified_at,
        sirene_checked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'provider', 'active', $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id
    `,
    [
      userId,
      normalizedCompanyName,
      normalizedCompanyName,
      normalizedSiret,
      normalizedSiren,
      normalizedCommercialName,
      normalizedFirstName,
      normalizedLastName,
      normalizedEmail,
      passwordHash,
      normalizedAddress,
      normalizedPostalCode,
      normalizedCity,
      normalizedApeCode,
      normalizedEstablishmentStatus,
      verifiedCompanyIdentity.verificationStatus,
      verifiedCompanyIdentity.verifiedAt,
      verifiedCompanyIdentity.checkedAt,
    ]
  );

  await ensureUserSettingsRecords(rows[0].id);
  const authContext = {
    sessionProfile: "standard",
    displayEmail: normalizedEmail,
  };

  return {
    token: buildToken(rows[0].id, authContext),
    user: await getUserAccountProfile(rows[0].id, authContext),
  };
};

export const loginUser = async ({ email, password }) => {
  if (!email?.trim() || !password) {
    throw new HttpError(400, "Email et mot de passe obligatoires.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail === normalizedSuperAdminEmail) {
    await ensureSuperAdminAccount();
  }

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
  const user = rows[0];

  if (!user) {
    throw new HttpError(401, "Identifiants invalides.");
  }

  assertProviderAccountNotArchived(user);

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new HttpError(401, "Identifiants invalides.");
  }

  return {
    token: buildToken(user.id, {
      sessionProfile: "standard",
      displayEmail: normalizedEmail,
    }),
    user: await getUserAccountProfile(user.id, {
      sessionProfile: "standard",
      displayEmail: normalizedEmail,
    }),
  };
};

export const getCurrentUser = async (userId, authContext = {}) =>
  getUserAccountProfile(userId, authContext);

export const requestPasswordReset = async ({ email }) => {
  await requestPasswordResetForEmail(email, {
    suppressUnknownUser: true,
  });

  return {
    message:
      "Si un compte existe avec cette adresse email, un lien de reinitialisation a ete prepare.",
  };
};

export const resetPassword = async ({ token, password }) =>
  resetPasswordWithToken({ token, password });

export { previewSiretVerification };
