import crypto from "crypto";

import bcrypt from "bcryptjs";

import env from "../config/env.js";
import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";
import { deliverEmail } from "./mail-delivery.service.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const buildTokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

const buildResetUrl = (token) => {
  const separator = env.passwordResetBaseUrl.includes("?") ? "&" : "?";
  return `${env.passwordResetBaseUrl}${separator}token=${encodeURIComponent(token)}`;
};

const getExpirationDate = () =>
  new Date(Date.now() + env.passwordResetTokenTtlMinutes * 60 * 1000);

const buildCredentialEmail = ({ fullName, resetUrl, expiresAt, purpose }) => {
  const isActivation = purpose === "activation";
  const expirationLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(expiresAt);

  return {
    subject: isActivation
      ? "Lokify - activez votre compte"
      : "Lokify - reinitialisation de votre mot de passe",
    text: [
      `Bonjour ${fullName || "sur Lokify"},`,
      "",
      isActivation
        ? "Votre compte Lokify a ete cree. Utilisez ce lien securise pour definir votre mot de passe et activer votre acces."
        : "Une demande de reinitialisation de mot de passe a ete effectuee pour votre compte Lokify.",
      isActivation
        ? "Utilisez ce lien securise pour activer votre compte :"
        : "Utilisez ce lien securise pour choisir un nouveau mot de passe :",
      resetUrl,
      "",
      `Ce lien expire le ${expirationLabel}.`,
      isActivation
        ? "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email."
        : "Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #183041;">
        <p>Bonjour ${fullName || "sur Lokify"},</p>
        <p>${
          isActivation
            ? "Votre compte Lokify a ete cree. Utilisez ce lien securise pour definir votre mot de passe et activer votre acces."
            : "Une demande de reinitialisation de mot de passe a ete effectuee pour votre compte Lokify."
        }</p>
        <p>
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:12px 18px;border-radius:999px;background:#00a9e1;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            ${isActivation ? "Activer mon compte" : "Reinitialiser mon mot de passe"}
          </a>
        </p>
        <p>Ce lien expire le ${expirationLabel}.</p>
        <p>${
          isActivation
            ? "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email."
            : "Si vous n'etes pas a l'origine de cette demande, vous pouvez ignorer cet email."
        }</p>
      </div>
    `,
  };
};

const getUserForPasswordResetByEmail = async (email) => {
  const { rows } = await query(
    `
      SELECT id, full_name, email, account_role
      , provider_status
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
};

const getUserForPasswordResetById = async (userId) => {
  const { rows } = await query(
    `
      SELECT id, full_name, email, account_role
      , provider_status
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Utilisateur introuvable.");
  }

  return rows[0];
};

const invalidateExistingTokens = async (userId) => {
  await query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [userId]
  );
};

const persistPasswordResetToken = async ({
  userId,
  tokenHash,
  expiresAt,
  requestedByUserId = null,
  deliveryMode,
  deliveryReference,
}) => {
  await query(
    `
      INSERT INTO password_reset_tokens (
        id,
        user_id,
        token_hash,
        requested_by_user_id,
        delivery_mode,
        delivery_reference,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      crypto.randomUUID(),
      userId,
      tokenHash,
      requestedByUserId,
      deliveryMode,
      deliveryReference,
      expiresAt.toISOString(),
    ]
  );
};

export const requestPasswordResetForUser = async (
  userId,
  { requestedByUserId = null, purpose = "password_reset" } = {}
) => {
  const user = await getUserForPasswordResetById(userId);
  const effectivePurpose =
    purpose === "activation" || user.provider_status === "invited"
      ? "activation"
      : "password_reset";
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = buildTokenHash(rawToken);
  const expiresAt = getExpirationDate();
  const resetUrl = buildResetUrl(rawToken);
  const emailPayload = buildCredentialEmail({
    fullName: user.full_name,
    resetUrl,
    expiresAt,
    purpose: effectivePurpose,
  });

  const delivery = await deliverEmail({
    to: user.email,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
  });

  await invalidateExistingTokens(user.id);
  await persistPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt,
    requestedByUserId,
    deliveryMode: delivery.deliveryMode,
    deliveryReference: delivery.deliveryReference,
  });

  return {
    email: user.email,
    requestedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    deliveryMode: delivery.deliveryMode,
    deliveryReference: delivery.deliveryReference,
    purpose: effectivePurpose,
  };
};

export const requestPasswordResetForEmail = async (
  email,
  { requestedByUserId = null, suppressUnknownUser = true } = {}
) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new HttpError(400, "L'email est obligatoire.");
  }

  const user = await getUserForPasswordResetByEmail(normalizedEmail);

  if (!user) {
    if (suppressUnknownUser) {
      return {
        requestedAt: new Date().toISOString(),
        deliveryMode: "none",
      };
    }

    throw new HttpError(404, "Utilisateur introuvable.");
  }

  return requestPasswordResetForUser(user.id, { requestedByUserId });
};

export const resetPasswordWithToken = async ({ token, password }) => {
  const normalizedToken = String(token || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedToken) {
    throw new HttpError(400, "Le lien de reinitialisation est incomplet.");
  }

  if (normalizedPassword.length < 6) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 6 caracteres.");
  }

  const tokenHash = buildTokenHash(normalizedToken);
  const { rows } = await query(
    `
      SELECT password_reset_tokens.id, password_reset_tokens.user_id, users.provider_status
      FROM password_reset_tokens
      INNER JOIN users
        ON users.id = password_reset_tokens.user_id
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );
  const resetToken = rows[0];

  if (!resetToken) {
    throw new HttpError(400, "Le lien de reinitialisation est invalide ou expire.");
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 10);

  await query(
    `
      UPDATE users
      SET password_hash = $2,
          provider_status = CASE
            WHEN provider_status = 'invited' THEN 'active'
            ELSE provider_status
          END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [resetToken.user_id, passwordHash]
  );

  await query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
    `,
    [resetToken.id]
  );

  return {
    message:
      resetToken.provider_status === "invited"
        ? "Votre compte a bien ete active et votre mot de passe enregistre."
        : "Le mot de passe a bien ete reinitialise.",
  };
};
