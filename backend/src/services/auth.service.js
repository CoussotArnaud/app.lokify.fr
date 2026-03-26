import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { query } from "../config/db.js";
import env from "../config/env.js";
import { ensureUserSettingsRecords, getUserAccountProfile } from "./account-profile.service.js";
import {
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "./password-reset.service.js";
import HttpError from "../utils/http-error.js";

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

export const registerUser = async ({ full_name, email, password }) => {
  if (!full_name?.trim()) {
    throw new HttpError(400, "Le nom complet est obligatoire.");
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
    throw new HttpError(409, "Un utilisateur avec cet email existe deja.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  const { rows } = await query(
    `
      INSERT INTO users (id, full_name, email, password_hash, account_role, provider_status)
      VALUES ($1, $2, $3, $4, 'provider', 'active')
      RETURNING id
    `,
    [userId, full_name.trim(), normalizedEmail, passwordHash]
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
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
  const user = rows[0];

  if (!user) {
    throw new HttpError(401, "Identifiants invalides.");
  }

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
