import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";
import { getUserAccountProfile } from "./account-profile.service.js";

const normalizeText = (value) => String(value || "").trim();
const normalizeNullableText = (value) => {
  const normalizedValue = normalizeText(value);
  return normalizedValue || null;
};

export const updateCurrentUserProfile = async (userId, payload = {}, authContext = {}) => {
  const normalizedFirstName = normalizeNullableText(payload.first_name);
  const normalizedLastName = normalizeNullableText(payload.last_name);
  const normalizedPhone = normalizeNullableText(payload.phone);
  const fallbackFullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ");
  const normalizedFullName = normalizeText(payload.full_name || fallbackFullName);

  if (!normalizedFullName) {
    throw new HttpError(400, "Le nom affiche est obligatoire.");
  }

  if (normalizedFullName.length > 120) {
    throw new HttpError(400, "Le nom affiche est trop long.");
  }

  if (normalizedFirstName && normalizedFirstName.length > 80) {
    throw new HttpError(400, "Le prenom est trop long.");
  }

  if (normalizedLastName && normalizedLastName.length > 80) {
    throw new HttpError(400, "Le nom est trop long.");
  }

  if (normalizedPhone && normalizedPhone.length > 40) {
    throw new HttpError(400, "Le numero de telephone est trop long.");
  }

  const { rowCount } = await query(
    `
      UPDATE users
      SET
        full_name = $2,
        first_name = $3,
        last_name = $4,
        phone = $5,
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId, normalizedFullName, normalizedFirstName, normalizedLastName, normalizedPhone]
  );

  if (!rowCount) {
    throw new HttpError(404, "Utilisateur introuvable.");
  }

  return getUserAccountProfile(userId, authContext);
};
