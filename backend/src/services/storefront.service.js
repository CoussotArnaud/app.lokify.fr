import crypto from "crypto";

import env from "../config/env.js";
import { query } from "../config/db.js";
import HttpError from "../utils/http-error.js";
import { listCatalogCategories, listCatalogPacks, listItemProfiles } from "./catalog.service.js";
import { createClient, restoreClient } from "./clients.service.js";
import {
  getCustomerPaymentSettings,
  getCustomerPaymentSettingsSnapshot,
} from "./customer-payments.service.js";
import { listItems } from "./items.service.js";
import { getResolvedSuperAdminStripeConfiguration } from "./platform-stripe-settings.service.js";
import { notifyProviderAboutStorefrontReservation } from "./storefront-notification.service.js";
import {
  abortStorefrontHeroImageUploadSession,
  completeStorefrontHeroImageUploadSession,
  consumeStorefrontHeroImageTempUpload,
  createStorefrontHeroImageUploadSession,
  downloadStorefrontManagedHeroImage,
  deleteStorefrontManagedHeroImage,
  deleteStorefrontTemporaryUpload,
  MAX_STOREFRONT_HERO_IMAGES,
  uploadStorefrontHeroImagePart,
} from "./storefront-photo-storage.service.js";
import {
  createConnectedAccountCheckoutSession,
  retrieveConnectedAccountCheckoutSession,
} from "./stripe-connect.service.js";
import { getPlanning } from "./planning.service.js";
import { createReservation, getReservationById } from "./reservations.service.js";

const allowedFulfillmentModes = new Set(["pickup", "delivery", "onsite"]);
const allowedStorefrontApprovalModes = new Set(["manual", "automatic"]);
const blockedStorefrontItemStatuses = new Set(["maintenance", "unavailable"]);
const storefrontSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const storefrontSlugMinLength = 3;
const storefrontSlugMaxLength = 60;
const slugChangeCooldownMs = 24 * 60 * 60 * 1000;

const normalizeWhitespace = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeEmail = (value) => normalizeWhitespace(value).toLowerCase();
const normalizeOptionalStorefrontText = (value) => {
  const normalizedValue = normalizeWhitespace(value);
  return normalizedValue || null;
};
const normalizeOptionalStorefrontUrl = (value) => {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
};

const normalizePhone = (value) => {
  const digitsOnly = normalizeWhitespace(value).replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("33") && digitsOnly.length === 11) {
    return `0${digitsOnly.slice(2)}`;
  }

  return digitsOnly;
};

const toNumber = (value) => Number(value || 0);
const toMoneyCents = (value) => Math.max(0, Math.round(toNumber(value) * 100));
const fromMoneyCents = (value) => Number((Number(value || 0) / 100).toFixed(2));
const parseJsonList = (value, fallback = []) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
};
const parseJsonObject = (value) => {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const normalizeStorefrontSlug = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, storefrontSlugMaxLength)
    .replace(/-+$/g, "");

const normalizeStorefrontHeroImageEntry = (entry) => {
  const isObjectEntry = entry && typeof entry === "object" && !Array.isArray(entry);
  const url = normalizeOptionalStorefrontUrl(isObjectEntry ? entry.url : entry);

  if (!url) {
    return null;
  }

  const width = Number(isObjectEntry ? entry.width : 0);
  const height = Number(isObjectEntry ? entry.height : 0);
  const sizeBytes = Number(
    isObjectEntry ? entry.size_bytes ?? entry.sizeBytes : 0
  );

  return {
    url,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    size_bytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : null,
    mime_type: normalizeOptionalStorefrontText(
      isObjectEntry ? entry.mime_type ?? entry.mimeType : null
    ),
    original_file_name: normalizeOptionalStorefrontText(
      isObjectEntry ? entry.original_file_name ?? entry.originalFileName : null
    ),
    source_mime_type: normalizeOptionalStorefrontText(
      isObjectEntry ? entry.source_mime_type ?? entry.sourceMimeType : null
    ),
  };
};

const normalizeStorefrontHeroImageEntries = (value) => {
  const entries = [];
  const seen = new Set();

  (Array.isArray(value) ? value : []).forEach((entry) => {
    const normalizedEntry = normalizeStorefrontHeroImageEntry(entry);

    if (!normalizedEntry || seen.has(normalizedEntry.url)) {
      return;
    }

    seen.add(normalizedEntry.url);
    entries.push(normalizedEntry);
  });

  return entries;
};

const normalizeStorefrontHeroImageUrls = (value) =>
  normalizeStorefrontHeroImageEntries(
    (Array.isArray(value) ? value : []).map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry) ? entry.url : entry
    )
  ).map((entry) => entry.url);

const normalizeStorefrontHeroImageUploads = (value) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => ({
      client_id: normalizeOptionalStorefrontText(
        entry?.client_id ?? entry?.clientId ?? null
      ),
      temp_object_key: normalizeOptionalStorefrontText(
        entry?.temp_object_key ?? entry?.tempObjectKey ?? null
      ),
      file_name: normalizeOptionalStorefrontText(
        entry?.file_name ?? entry?.fileName ?? null
      ),
      mime_type: normalizeOptionalStorefrontText(
        entry?.mime_type ?? entry?.mimeType ?? null
      ),
      size_bytes: Number(entry?.size_bytes ?? entry?.sizeBytes ?? 0),
    }))
    .filter((entry) => entry.temp_object_key);

const normalizeStorefrontHeroImageSequence = (value) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);

const buildStorefrontPaymentSummary = async (userId) => {
  const settings = await getCustomerPaymentSettingsSnapshot(userId);
  const onlinePaymentAvailable =
    Boolean(settings?.onlinePayment?.enabled) && Boolean(settings?.onlinePayment?.canEnable);

  return {
    enabled: onlinePaymentAvailable,
    mode: onlinePaymentAvailable ? "checkout" : "request",
    label: onlinePaymentAvailable
      ? "Paiement en ligne disponible"
      : "Paiement en ligne desactive",
    description: onlinePaymentAvailable
      ? "Le montant de location peut etre regle en ligne. La caution reste indiquee separement."
      : "La boutique fonctionne en demande de reservation, sans paiement en ligne.",
  };
};

const assertValidStorefrontSlug = (slug) => {
  if (!slug) {
    throw new HttpError(400, "Le slug boutique est obligatoire.");
  }

  if (slug.length < storefrontSlugMinLength) {
    throw new HttpError(400, "Le slug boutique doit contenir au moins 3 caracteres.");
  }

  if (slug.length > storefrontSlugMaxLength) {
    throw new HttpError(400, "Le slug boutique est trop long.");
  }

  if (!storefrontSlugPattern.test(slug)) {
    throw new HttpError(
      400,
      "Le slug boutique ne peut contenir que des lettres, chiffres et tirets."
    );
  }
};

const normalizeCustomerPayload = (payload = {}) => ({
  first_name: normalizeWhitespace(payload.first_name ?? payload.firstName ?? ""),
  last_name: normalizeWhitespace(payload.last_name ?? payload.lastName ?? ""),
  email: normalizeEmail(payload.email ?? ""),
  phone: normalizeWhitespace(payload.phone ?? ""),
  address: normalizeWhitespace(payload.address ?? ""),
  notes: normalizeWhitespace(payload.notes ?? ""),
});

const normalizeRequestLine = (payload = {}) => ({
  item_id: String(payload.item_id ?? payload.itemId ?? "").trim(),
  quantity: Number(payload.quantity ?? 1),
  unit_price:
    payload.unit_price === null ||
    payload.unit_price === undefined ||
    payload.unit_price === ""
      ? payload.unitPrice === null || payload.unitPrice === undefined || payload.unitPrice === ""
        ? null
        : Number(payload.unitPrice)
      : Number(payload.unit_price),
  notes: normalizeWhitespace(payload.notes ?? ""),
  merge_key: normalizeWhitespace(payload.merge_key ?? payload.mergeKey ?? ""),
});

const buildStorefrontLineMergeKey = (line) => {
  if (line.merge_key) {
    return line.merge_key;
  }

  const unitPriceKey =
    line.unit_price === null || line.unit_price === undefined || line.unit_price === ""
      ? ""
      : Number(line.unit_price).toFixed(2);

  return [line.item_id, unitPriceKey, line.notes || ""].join("::");
};

const mergeRequestLines = (lines = []) => {
  const mergedLines = new Map();
  const order = [];

  lines
    .map(normalizeRequestLine)
    .filter((line) => line.item_id)
    .forEach((line) => {
      const mergeKey = buildStorefrontLineMergeKey(line);
      const currentLine = mergedLines.get(mergeKey);

      if (!currentLine) {
        mergedLines.set(mergeKey, {
          item_id: line.item_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          notes: line.notes,
          merge_key: line.merge_key,
        });
        order.push(mergeKey);
        return;
      }

      mergedLines.set(mergeKey, {
        ...currentLine,
        quantity: currentLine.quantity + line.quantity,
        unit_price: currentLine.unit_price ?? line.unit_price,
        notes: currentLine.notes || line.notes,
      });
    });

  return order.map((mergeKey) => mergedLines.get(mergeKey));
};

const normalizeOptionIds = (value) => {
  const rawValues = Array.isArray(value)
    ? value
    : Array.isArray(value?.selected_option_ids)
      ? value.selected_option_ids
      : [];

  return rawValues
    .map((entry) => String(entry?.option_id ?? entry?.optionId ?? entry?.id ?? entry ?? "").trim())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
};

const normalizeCartItem = (payload = {}) => ({
  entry_type: String(payload.entry_type ?? payload.entryType ?? payload.kind ?? "product")
    .trim()
    .toLowerCase(),
  item_id: String(payload.item_id ?? payload.itemId ?? "").trim(),
  pack_id: String(payload.pack_id ?? payload.packId ?? "").trim(),
  quantity: Number(payload.quantity ?? 1),
  option_ids: normalizeOptionIds(
    payload.option_ids ??
      payload.optionIds ??
      payload.selected_option_ids ??
      payload.selectedOptionIds ??
      payload.options ??
      []
  ),
});

const normalizeStorefrontProductOptions = (options = []) =>
  (Array.isArray(options) ? options : [])
    .map((option) => ({
      id: String(option?.id ?? "").trim(),
      name: normalizeWhitespace(option?.name ?? ""),
      price: toNumber(option?.price),
      required: Boolean(option?.required ?? option?.is_required),
    }))
    .filter((option) => option.id && option.name);

const applyDiscountToTotalCents = (baseTotalCents, discountType, discountValue) => {
  if (baseTotalCents <= 0) {
    return 0;
  }

  if (discountType === "amount") {
    return Math.max(baseTotalCents - toMoneyCents(discountValue), 0);
  }

  if (discountType === "percentage") {
    return Math.max(
      Math.round(baseTotalCents * (1 - Math.min(Math.max(toNumber(discountValue), 0), 100) / 100)),
      0
    );
  }

  return baseTotalCents;
};

const allocateMoneyCents = (baseValues, targetTotalCents) => {
  if (!baseValues.length) {
    return [];
  }

  const normalizedValues = baseValues.map((value) => Math.max(0, Number(value || 0)));
  const totalBase = normalizedValues.reduce((sum, value) => sum + value, 0);

  if (targetTotalCents <= 0 || totalBase <= 0) {
    return normalizedValues.map(() => 0);
  }

  const rawAllocations = normalizedValues.map((value) => (value / totalBase) * targetTotalCents);
  const floorAllocations = rawAllocations.map((value) => Math.floor(value));
  let remainingCents =
    targetTotalCents - floorAllocations.reduce((sum, value) => sum + value, 0);

  rawAllocations
    .map((value, index) => ({
      index,
      remainder: value - floorAllocations[index],
      baseValue: normalizedValues[index],
    }))
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      if (right.baseValue !== left.baseValue) {
        return right.baseValue - left.baseValue;
      }

      return left.index - right.index;
    })
    .forEach((entry) => {
      if (remainingCents <= 0) {
        return;
      }

      floorAllocations[entry.index] += 1;
      remainingCents -= 1;
    });

  return floorAllocations;
};

const serializeStorefrontSettings = (row) => {
  const heroImages = normalizeStorefrontHeroImageEntries(
    parseJsonList(row.hero_images_json, [])
  );

  return {
    user_id: row.user_id,
    slug: row.slug,
    is_published: Boolean(row.is_published),
    reservation_approval_mode:
      row.reservation_approval_mode &&
      allowedStorefrontApprovalModes.has(row.reservation_approval_mode)
        ? row.reservation_approval_mode
        : "manual",
    map_enabled: Boolean(row.map_enabled),
    map_address: row.map_address || "",
    reviews_enabled: Boolean(row.reviews_enabled),
    reviews_url: row.reviews_url || "",
    hero_images: heroImages,
    hero_image_urls: heroImages.map((entry) => entry.url),
    slug_updated_at: row.slug_updated_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

const buildStorefrontDisplayName = (owner) =>
  normalizeWhitespace(owner?.commercial_name || owner?.company_name || owner?.full_name || "") ||
  "Boutique Lokify";

const serializeStorefrontOwner = (row) => ({
  id: row.id,
  full_name: row.full_name || "",
  company_name: row.company_name || "",
  commercial_name: row.commercial_name || "",
  city: row.city || "",
  display_name: buildStorefrontDisplayName(row),
});

const joinSlugWithSuffix = (baseSlug, suffix) => {
  const separator = suffix ? "-" : "";
  const maxBaseLength = storefrontSlugMaxLength - separator.length - suffix.length;
  const trimmedBase = baseSlug.slice(0, Math.max(maxBaseLength, storefrontSlugMinLength)).replace(/-+$/g, "");
  return `${trimmedBase}${separator}${suffix}`;
};

const buildOrderedStorefrontHeroImages = ({
  retainedImages = [],
  uploadedImages = [],
  imageSequence = [],
}) => {
  const orderedImages = [];
  const seen = new Set();
  const retainedImageMap = new Map(retainedImages.map((image) => [image.url, image]));
  const uploadedImageMap = new Map(
    uploadedImages
      .filter((image) => image.sequenceKey)
      .map((image) => [image.sequenceKey, image.image])
  );

  imageSequence.forEach((sequenceEntry) => {
    const retainedImage = retainedImageMap.get(sequenceEntry);
    const uploadedImage = uploadedImageMap.get(sequenceEntry);
    const resolvedImage = retainedImage || uploadedImage || null;

    if (!resolvedImage || seen.has(resolvedImage.url)) {
      return;
    }

    seen.add(resolvedImage.url);
    orderedImages.push(resolvedImage);
  });

  [...retainedImages, ...uploadedImages.map((entry) => entry.image)].forEach((image) => {
    if (!image || seen.has(image.url)) {
      return;
    }

    seen.add(image.url);
    orderedImages.push(image);
  });

  return orderedImages;
};

const deleteUnusedStorefrontHeroImages = async (removedImages = []) => {
  for (const image of removedImages) {
    const imageUrl = image?.url || image;
    if (!imageUrl) {
      continue;
    }

    try {
      await deleteStorefrontManagedHeroImage(imageUrl);
    } catch (_error) {
      // Ignore cleanup failures to avoid blocking storefront settings updates.
    }
  }
};

const syncStorefrontHeroImages = async (
  userId,
  { currentImages = [], retainedImages, imageUploads = [], imageSequence = [] } = {}
) => {
  const nextRetainedImageUrls =
    retainedImages === undefined
      ? currentImages.map((image) => image.url)
      : normalizeStorefrontHeroImageUrls(retainedImages);
  const retainedImageMap = new Map(currentImages.map((image) => [image.url, image]));
  const nextRetainedImages = nextRetainedImageUrls
    .map((imageUrl) => retainedImageMap.get(imageUrl))
    .filter(Boolean);
  const normalizedImageUploads = normalizeStorefrontHeroImageUploads(imageUploads);
  const normalizedImageSequence = normalizeStorefrontHeroImageSequence(imageSequence);

  if (nextRetainedImages.length + normalizedImageUploads.length > MAX_STOREFRONT_HERO_IMAGES) {
    throw new HttpError(
      400,
      `Vous ne pouvez pas ajouter plus de ${MAX_STOREFRONT_HERO_IMAGES} images sur ce bloc photo.`,
      { code: "storefront_image_limit" }
    );
  }

  const uploadedImages = [];

  try {
    for (const imageUpload of normalizedImageUploads) {
      const uploadedImage = await consumeStorefrontHeroImageTempUpload({
        userId,
        tempObjectKey: imageUpload.temp_object_key,
        fileName: imageUpload.file_name,
        mimeType: imageUpload.mime_type,
      });

      uploadedImages.push({
        image: normalizeStorefrontHeroImageEntry(uploadedImage),
        sequenceKey: imageUpload.client_id ? `upload:${imageUpload.client_id}` : null,
      });
    }
  } catch (error) {
    await deleteUnusedStorefrontHeroImages(uploadedImages.map((entry) => entry.image));
    throw error;
  }

  const finalImages = normalizedImageSequence.length
    ? buildOrderedStorefrontHeroImages({
        retainedImages: nextRetainedImages,
        uploadedImages,
        imageSequence: normalizedImageSequence,
      })
    : [...nextRetainedImages, ...uploadedImages.map((entry) => entry.image)];
  const removedImages = currentImages.filter(
    (currentImage) => !finalImages.some((finalImage) => finalImage.url === currentImage.url)
  );

  return {
    finalImages: normalizeStorefrontHeroImageEntries(finalImages),
    removedImages,
    uploadedImages: uploadedImages.map((entry) => entry.image),
  };
};

const getStorefrontOwnerRow = async (userId) => {
  const { rows } = await query(
    `
      SELECT
        id,
        full_name,
        company_name,
        commercial_name,
        city,
        provider_status,
        archived_at
      FROM users
      WHERE id = $1
        AND account_role = 'provider'
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Prestataire introuvable pour la boutique.");
  }

  return rows[0];
};

const getStorefrontSettingsRow = async (userId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM storefront_settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

const isStorefrontSlugAvailable = async (slug, excludedUserId = null) => {
  const { rows } = await query(
    `
      SELECT user_id
      FROM storefront_settings
      WHERE slug = $1
      LIMIT 1
    `,
    [slug]
  );

  if (!rows[0]) {
    return true;
  }

  return excludedUserId ? rows[0].user_id === excludedUserId : false;
};

const buildUniqueStorefrontSlug = async (rawValue, excludedUserId = null) => {
  const baseSlug = normalizeStorefrontSlug(rawValue) || "boutique";
  assertValidStorefrontSlug(baseSlug);

  if (await isStorefrontSlugAvailable(baseSlug, excludedUserId)) {
    return baseSlug;
  }

  for (let attempt = 2; attempt <= 25; attempt += 1) {
    const nextSlug = joinSlugWithSuffix(baseSlug, String(attempt));

    if (await isStorefrontSlugAvailable(nextSlug, excludedUserId)) {
      return nextSlug;
    }
  }

  const randomSuffix = crypto.randomUUID().slice(0, 6);
  const fallbackSlug = joinSlugWithSuffix(baseSlug, randomSuffix);

  if (await isStorefrontSlugAvailable(fallbackSlug, excludedUserId)) {
    return fallbackSlug;
  }

  throw new HttpError(409, "Impossible de generer un slug boutique unique.");
};

export const ensureStorefrontSettingsRecord = async (userId) => {
  const existingRow = await getStorefrontSettingsRow(userId);

  if (existingRow) {
    return serializeStorefrontSettings(existingRow);
  }

  const owner = await getStorefrontOwnerRow(userId);
  const slug = await buildUniqueStorefrontSlug(
    owner.commercial_name || owner.company_name || owner.full_name || "boutique"
  );

  const { rows } = await query(
    `
        INSERT INTO storefront_settings (
          user_id,
          slug,
          is_published,
          reservation_approval_mode,
          map_enabled,
          map_address,
          reviews_enabled,
          reviews_url,
          slug_updated_at
        )
        VALUES ($1, $2, FALSE, 'manual', FALSE, NULL, FALSE, NULL, NULL)
        ON CONFLICT (user_id) DO UPDATE
        SET updated_at = storefront_settings.updated_at
        RETURNING *
    `,
    [userId, slug]
  );

  return serializeStorefrontSettings(rows[0]);
};

export const getStorefrontSettings = async (userId) => ensureStorefrontSettingsRecord(userId);

export const updateStorefrontSettings = async (userId, payload = {}) => {
  const currentSettings = await ensureStorefrontSettingsRecord(userId);
  const currentSlug = currentSettings.slug;
  const payloadHasSlug = Object.prototype.hasOwnProperty.call(payload, "slug");
  const payloadHasPublished = Object.prototype.hasOwnProperty.call(payload, "is_published");
  const payloadHasApprovalMode = Object.prototype.hasOwnProperty.call(
    payload,
    "reservation_approval_mode"
  );
  const payloadHasMapEnabled = Object.prototype.hasOwnProperty.call(payload, "map_enabled");
  const payloadHasMapAddress = Object.prototype.hasOwnProperty.call(payload, "map_address");
  const payloadHasReviewsEnabled = Object.prototype.hasOwnProperty.call(payload, "reviews_enabled");
  const payloadHasReviewsUrl = Object.prototype.hasOwnProperty.call(payload, "reviews_url");
  const payloadHasHeroImages = Object.prototype.hasOwnProperty.call(payload, "hero_images");
  const payloadHasHeroImageUploads = Object.prototype.hasOwnProperty.call(payload, "hero_image_uploads");
  const payloadHasHeroImageSequence = Object.prototype.hasOwnProperty.call(payload, "hero_image_sequence");

  let nextSlug = currentSlug;
  let nextSlugUpdatedAt = currentSettings.slug_updated_at;

  if (payloadHasSlug) {
    nextSlug = normalizeStorefrontSlug(payload.slug);
    assertValidStorefrontSlug(nextSlug);

    if (nextSlug !== currentSlug) {
      if (currentSettings.slug_updated_at) {
        const elapsedMs = Date.now() - new Date(currentSettings.slug_updated_at).getTime();

        if (elapsedMs < slugChangeCooldownMs) {
          throw new HttpError(
            409,
            "Le slug boutique a deja ete modifie recemment. Merci de patienter avant un nouveau changement.",
            { code: "storefront_slug_cooldown" }
          );
        }
      }

      if (!(await isStorefrontSlugAvailable(nextSlug, userId))) {
        throw new HttpError(409, "Ce lien boutique est deja utilise par un autre prestataire.");
      }

      nextSlugUpdatedAt = new Date().toISOString();
    }
  }

  const nextPublished = payloadHasPublished ? Boolean(payload.is_published) : currentSettings.is_published;
  const nextApprovalMode = payloadHasApprovalMode
    ? String(payload.reservation_approval_mode || "").trim().toLowerCase()
    : currentSettings.reservation_approval_mode;
  const nextMapEnabled = payloadHasMapEnabled
    ? Boolean(payload.map_enabled)
    : currentSettings.map_enabled;
  const nextMapAddress = payloadHasMapAddress
    ? normalizeOptionalStorefrontText(payload.map_address)
    : normalizeOptionalStorefrontText(currentSettings.map_address);
  const nextReviewsEnabled = payloadHasReviewsEnabled
    ? Boolean(payload.reviews_enabled)
    : currentSettings.reviews_enabled;
  const nextReviewsUrl = payloadHasReviewsUrl
    ? normalizeOptionalStorefrontUrl(payload.reviews_url)
    : normalizeOptionalStorefrontUrl(currentSettings.reviews_url);

  if (!allowedStorefrontApprovalModes.has(nextApprovalMode)) {
    throw new HttpError(400, "Le mode de validation boutique est invalide.");
  }

  const shouldSyncHeroImages =
    payloadHasHeroImages || payloadHasHeroImageUploads || payloadHasHeroImageSequence;
  const heroImageSyncResult = shouldSyncHeroImages
    ? await syncStorefrontHeroImages(userId, {
        currentImages: currentSettings.hero_images,
        retainedImages: payloadHasHeroImages
          ? payload.hero_images
          : currentSettings.hero_image_urls,
        imageUploads: payloadHasHeroImageUploads ? payload.hero_image_uploads : [],
        imageSequence: payloadHasHeroImageSequence ? payload.hero_image_sequence : [],
      })
    : {
        finalImages: currentSettings.hero_images,
        removedImages: [],
        uploadedImages: [],
      };

  try {
    const { rows } = await query(
      `
        UPDATE storefront_settings
        SET slug = $2,
            is_published = $3,
            reservation_approval_mode = $4,
            slug_updated_at = $5,
            map_enabled = $6,
            map_address = $7,
            reviews_enabled = $8,
            reviews_url = $9,
            hero_images_json = $10
        WHERE user_id = $1
        RETURNING *
      `,
      [
        userId,
        nextSlug,
        nextPublished,
        nextApprovalMode,
        nextSlugUpdatedAt,
        nextMapEnabled,
        nextMapAddress,
        nextReviewsEnabled,
        nextReviewsUrl,
        JSON.stringify(heroImageSyncResult.finalImages),
      ]
    );

    await deleteUnusedStorefrontHeroImages(heroImageSyncResult.removedImages);
    return serializeStorefrontSettings(rows[0]);
  } catch (error) {
    await deleteUnusedStorefrontHeroImages(heroImageSyncResult.uploadedImages);
    throw error;
  }
};

const resolveStorefrontOwnerBySlug = async (slug, { requirePublished = false } = {}) => {
  const normalizedSlug = normalizeStorefrontSlug(slug);

  if (!normalizedSlug) {
    throw new HttpError(404, "Boutique introuvable.");
  }

  const { rows } = await query(
    `
      SELECT
        storefront_settings.*,
        users.id,
        users.full_name,
        users.company_name,
        users.commercial_name,
        users.city,
        users.provider_status,
        users.archived_at
      FROM storefront_settings
      INNER JOIN users
        ON users.id = storefront_settings.user_id
      WHERE storefront_settings.slug = $1
        AND users.account_role = 'provider'
      LIMIT 1
    `,
    [normalizedSlug]
  );

  const row = rows[0];

  if (!row) {
    throw new HttpError(404, "Boutique introuvable.");
  }

  if (row.archived_at || row.provider_status !== "active") {
    throw new HttpError(403, "Boutique indisponible.");
  }

  const settings = serializeStorefrontSettings(row);

  if (requirePublished && !settings.is_published) {
    throw new HttpError(403, "Boutique indisponible.");
  }

  return {
    user_id: row.user_id,
    settings,
    owner: serializeStorefrontOwner(row),
  };
};

const buildAvailabilityByItemId = (planning) => {
  const availabilityByItemId = new Map(
    (planning.products || []).map((product) => [
      product.id,
      {
        usable_capacity: toNumber(product.usable_capacity),
        total_capacity: toNumber(product.total_capacity),
        min_available_quantity: toNumber(product.usable_capacity),
        max_reserved_quantity: 0,
        days_under_pressure: 0,
        shortage_detected: false,
        needs_unit_sync: Boolean(product.needs_unit_sync),
        blocked_units: toNumber(product.blocked_units),
      },
    ])
  );

  (planning.days || []).forEach((day) => {
    (day.products || []).forEach((product) => {
      const currentAvailability = availabilityByItemId.get(product.item_id) || {
        usable_capacity: toNumber(product.usable_capacity),
        total_capacity: toNumber(product.total_capacity),
        min_available_quantity: toNumber(product.available_quantity),
        max_reserved_quantity: 0,
        days_under_pressure: 0,
        shortage_detected: false,
        needs_unit_sync: Boolean(product.needs_unit_sync),
        blocked_units: toNumber(product.blocked_units),
      };

      currentAvailability.min_available_quantity = Math.min(
        currentAvailability.min_available_quantity,
        toNumber(product.available_quantity)
      );
      currentAvailability.max_reserved_quantity = Math.max(
        currentAvailability.max_reserved_quantity,
        toNumber(product.reserved_quantity)
      );
      currentAvailability.days_under_pressure += product.is_low ? 1 : 0;
      currentAvailability.shortage_detected =
        currentAvailability.shortage_detected || toNumber(product.shortage_quantity) > 0;
      availabilityByItemId.set(product.item_id, currentAvailability);
    });
  });

  return availabilityByItemId;
};

const buildFallbackAvailability = (item) => {
  const stock = toNumber(item.stock);
  const blockedByStatus = blockedStorefrontItemStatuses.has(item.status);

  return {
    usable_capacity: blockedByStatus ? 0 : stock,
    total_capacity: stock,
    min_available_quantity: blockedByStatus ? 0 : stock,
    max_reserved_quantity: 0,
    days_under_pressure: 0,
    shortage_detected: false,
    needs_unit_sync: false,
    blocked_units: 0,
  };
};

const resolveAvailabilityReason = (item, availability) => {
  if (blockedStorefrontItemStatuses.has(item.status)) {
    return "period";
  }

  if (availability.blocked_units > 0 && availability.usable_capacity <= 0) {
    return "period";
  }

  if (availability.total_capacity <= 0 || availability.usable_capacity <= 0) {
    return "stock";
  }

  if (availability.shortage_detected || availability.min_available_quantity <= 0) {
    return "period";
  }

  return "available";
};

const buildVisibleStorefrontProducts = ({ items, itemProfiles, planning }) => {
  const profileByItemId = new Map(itemProfiles.map((profile) => [profile.item_id, profile]));
  const availabilityByItemId = buildAvailabilityByItemId(planning);

  return items
    .map((item) => {
      const profile = profileByItemId.get(item.id) || null;
      const catalogMode = profile?.catalog_mode || "location";
      const isProfileActive = profile?.is_active === undefined ? true : Boolean(profile.is_active);
      const isReservable = profile?.reservable === undefined ? true : Boolean(profile.reservable);

      if (!profile?.online_visible || !isProfileActive || !isReservable || catalogMode !== "location") {
        return null;
      }

      const availability = availabilityByItemId.get(item.id) || buildFallbackAvailability(item);
      const availabilityReason = resolveAvailabilityReason(item, availability);
      const availabilityStatus =
        availabilityReason !== "available"
          ? "unavailable"
          : availability.days_under_pressure > 0
            ? "limited"
            : "available";
      const photos = Array.isArray(profile?.photos) ? profile.photos : [];
      const options = normalizeStorefrontProductOptions(profile?.options);

      return {
        id: item.id,
        name: item.name,
        item_status: item.status || "available",
        public_name: profile.public_name || item.name,
        public_description:
          profile.public_description || "Produit disponible en reservation en ligne.",
        long_description: profile.long_description || profile.public_description || "",
        category: profile.category_name || item.category || "Catalogue",
        category_slug: profile.category_slug || "",
        sku: profile.sku || `REF-${item.id.slice(0, 6).toUpperCase()}`,
        thumbnail: photos[0] || "",
        photos,
        availability_note: profile.availability_note || "",
        price: toNumber(item.price),
        deposit: toNumber(item.deposit),
        options,
        status: availabilityStatus,
        availability_reason: availabilityReason,
        available_quantity: Math.max(0, availability.min_available_quantity),
        usable_capacity: availability.usable_capacity,
        total_capacity: availability.total_capacity,
        max_reserved_quantity: availability.max_reserved_quantity,
        days_under_pressure: availability.days_under_pressure,
        needs_unit_sync: availability.needs_unit_sync,
        blocked_units: availability.blocked_units,
        is_active: isProfileActive,
        reservable: isReservable,
        is_featured: Boolean(profile?.is_featured),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.public_name.localeCompare(right.public_name, "fr"));
};

const buildStorefrontCategories = ({ products, catalogCategories = [] }) => {
  const categoryRecordBySlug = new Map(
    (Array.isArray(catalogCategories) ? catalogCategories : [])
      .filter((category) => category?.slug || category?.name)
      .map((category) => [category.slug || normalizeStorefrontSlug(category.name), category])
  );
  const categoryBuckets = new Map();

  products.forEach((product) => {
    const slug =
      normalizeWhitespace(product.category_slug || "") ||
      normalizeStorefrontSlug(product.category || "catalogue");
    const label = normalizeWhitespace(product.category || "Catalogue") || "Catalogue";
    const existingBucket = categoryBuckets.get(slug) || {
      slug,
      name: label,
      products: [],
    };

    existingBucket.products.push(product);
    categoryBuckets.set(slug, existingBucket);
  });

  return Array.from(categoryBuckets.values())
    .map((bucket) => {
      const categoryRecord = categoryRecordBySlug.get(bucket.slug) || null;
      const sortedProducts = [...bucket.products].sort(
        (left, right) => Number(left.price || 0) - Number(right.price || 0)
      );
      const firstProduct = sortedProducts[0] || null;
      const imageUrl =
        categoryRecord?.image_url ||
        categoryRecord?.logo_image_url ||
        categoryRecord?.banner_image_url ||
        firstProduct?.thumbnail ||
        "";

      return {
        slug: bucket.slug,
        name: bucket.name,
        description:
          categoryRecord?.description ||
          `Retrouvez ${bucket.products.length} produit(s) dans la categorie ${bucket.name}.`,
        image_url: imageUrl,
        image_alt_text:
          categoryRecord?.image_alt_text ||
          (bucket.name ? `Categorie ${bucket.name}` : "Categorie boutique"),
        product_count: bucket.products.length,
        starting_price: firstProduct ? toNumber(firstProduct.price) : 0,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
};

const buildVisibleStorefrontPacks = ({ catalogPacks, products }) => {
  const productById = new Map(products.map((product) => [product.id, product]));

  return catalogPacks
    .map((pack) => {
      if (!pack?.is_active) {
        return null;
      }

      const linkedProducts = (Array.isArray(pack.products) ? pack.products : [])
        .map((linkedProduct) => productById.get(linkedProduct.item_id))
        .filter(Boolean);

      if (!linkedProducts.length || linkedProducts.length !== (pack.products || []).length) {
        return null;
      }

      const basePriceCents = linkedProducts.reduce(
        (sum, product) => sum + toMoneyCents(product.price),
        0
      );
      const discountedPriceCents = applyDiscountToTotalCents(
        basePriceCents,
        pack.discount_type,
        pack.discount_value
      );
      const hasStockIssue = linkedProducts.some(
        (product) => product.status === "unavailable" && product.availability_reason === "stock"
      );
      const hasPeriodIssue = linkedProducts.some(
        (product) => product.status === "unavailable" && product.availability_reason !== "stock"
      );
      const availableQuantity = linkedProducts.reduce(
        (minimum, product) => Math.min(minimum, Number(product.available_quantity || 0)),
        Number.POSITIVE_INFINITY
      );

      return {
        id: pack.id,
        name: pack.name,
        description: pack.description || "",
        discount_type: pack.discount_type || "none",
        discount_value: toNumber(pack.discount_value),
        status:
          hasStockIssue || hasPeriodIssue
            ? "unavailable"
            : linkedProducts.some((product) => product.status === "limited")
              ? "limited"
              : "available",
        availability_reason: hasStockIssue ? "stock" : hasPeriodIssue ? "period" : "available",
        available_quantity: Number.isFinite(availableQuantity) ? Math.max(0, availableQuantity) : 0,
        price: fromMoneyCents(discountedPriceCents),
        base_price: fromMoneyCents(basePriceCents),
        deposit: linkedProducts.reduce((sum, product) => sum + toNumber(product.deposit), 0),
        product_count: linkedProducts.length,
        products: linkedProducts.map((product, index) => ({
          item_id: product.id,
          public_name: product.public_name,
          category: product.category,
          thumbnail: product.thumbnail,
          price: toNumber(product.price),
          deposit: toNumber(product.deposit),
          available_quantity: Number(product.available_quantity || 0),
          sort_order: index,
        })),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
};

const calculateStorefrontDurationInDays = (startValue, endValue) => {
  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return 1;
  }

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

const buildStorefrontPayload = async (
  userId,
  { start, end, storefrontSettings = null, storefrontOwner = null } = {}
) => {
  const [settings, owner, planning, items, itemProfiles, catalogPacks, catalogCategories, onlinePayment] =
    await Promise.all([
      storefrontSettings || ensureStorefrontSettingsRecord(userId),
      storefrontOwner || getStorefrontOwnerRow(userId).then(serializeStorefrontOwner),
      getPlanning(userId, { start, end }),
      listItems(userId),
      listItemProfiles(userId),
      listCatalogPacks(userId),
      listCatalogCategories(userId).catch(() => []),
      buildStorefrontPaymentSummary(userId),
    ]);

  const products = buildVisibleStorefrontProducts({
    items,
    itemProfiles,
    planning,
  });
  const packs = buildVisibleStorefrontPacks({
    catalogPacks,
    products,
  });
  const categories = buildStorefrontCategories({
    products,
    catalogCategories,
  });
  const featuredProducts = products.filter((product) => product.is_featured).slice(0, 6);

  return {
    storefront: {
      slug: settings.slug,
      is_published: settings.is_published,
      reservation_approval_mode: settings.reservation_approval_mode,
      display_name: owner.display_name,
      company_name: owner.company_name || "",
      commercial_name: owner.commercial_name || "",
      full_name: owner.full_name || "",
      city: owner.city || "",
      map_enabled: settings.map_enabled,
      map_address: settings.map_address || "",
      reviews_enabled: settings.reviews_enabled,
      reviews_url: settings.reviews_url || "",
      hero_images: settings.hero_image_urls,
      hero_image_urls: settings.hero_image_urls,
      path: `/shop/${settings.slug}`,
    },
    start: planning.start,
    end: planning.end,
    generated_at: planning.generated_at,
    categories,
    featured_products: featuredProducts,
    products,
    packs,
    summary: {
      visible_products: products.length,
      selectable_products: products.filter((product) => product.available_quantity > 0).length,
      visible_packs: packs.length,
      selectable_packs: packs.filter((pack) => pack.available_quantity > 0).length,
      total_available_quantity: products.reduce(
        (sum, product) => sum + product.available_quantity,
        0
      ),
    },
    online_payment: onlinePayment,
  };
};

const findExistingClient = async (userId, customer) => {
  const emailKey = normalizeEmail(customer.email);
  const phoneKey = normalizePhone(customer.phone);

  if (!emailKey && !phoneKey) {
    return null;
  }

  const { rows } = await query(
    `
      SELECT *
      FROM clients
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return (
    rows.find((client) => {
      if (emailKey && normalizeEmail(client.email) === emailKey) {
        return true;
      }

      if (phoneKey && normalizePhone(client.phone) === phoneKey) {
        return true;
      }

      return false;
    }) || null
  );
};

const buildAvailabilityConflictError = (product, requestedQuantity) => {
  const blockedByPeriod = blockedStorefrontItemStatuses.has(product.item_status);
  const isStockIssue =
    !blockedByPeriod &&
    (product.availability_reason === "stock" ||
      requestedQuantity > Math.max(0, Number(product.usable_capacity || 0)));

  return new HttpError(
    409,
    isStockIssue ? "Produit en rupture de stock" : "Produit indisponible sur cette periode",
    {
      code: isStockIssue ? "storefront_out_of_stock" : "storefront_unavailable_period",
      details: {
        item_id: product.id,
        product_name: product.public_name,
      },
    }
  );
};

export const getStorefrontPreview = async (userId, { start, end }) =>
  buildStorefrontPayload(userId, { start, end });

export const getPublicStorefrontPreview = async (slug, { start, end }) => {
  const storefront = await resolveStorefrontOwnerBySlug(slug, {
    requirePublished: true,
  });

  return buildStorefrontPayload(storefront.user_id, {
    start,
    end,
    storefrontSettings: storefront.settings,
    storefrontOwner: storefront.owner,
  });
};

export const startStorefrontHeroImageUpload = async (userId, payload = {}) =>
  createStorefrontHeroImageUploadSession({
    userId,
    fileName: payload.file_name ?? payload.fileName,
    mimeType: payload.mime_type ?? payload.mimeType,
    sizeBytes: payload.size_bytes ?? payload.sizeBytes,
  });

export const uploadStorefrontHeroImageChunk = async (
  userId,
  uploadId,
  payload = {}
) =>
  uploadStorefrontHeroImagePart({
    userId,
    uploadId,
    objectKey: payload.object_key ?? payload.objectKey,
    partNumber: payload.part_number ?? payload.partNumber,
    dataBase64: payload.data_base64 ?? payload.dataBase64,
  });

export const finalizeStorefrontHeroImageUpload = async (
  userId,
  uploadId,
  payload = {}
) =>
  completeStorefrontHeroImageUploadSession({
    userId,
    uploadId,
    objectKey: payload.object_key ?? payload.objectKey,
    parts: payload.parts,
    clientId: payload.client_id ?? payload.clientId,
    fileName: payload.file_name ?? payload.fileName,
    mimeType: payload.mime_type ?? payload.mimeType,
    sizeBytes: payload.size_bytes ?? payload.sizeBytes,
  });

export const cancelStorefrontHeroImageUpload = async (userId, payload = {}) => {
  const uploadId = payload.upload_id ?? payload.uploadId;
  const objectKey = payload.object_key ?? payload.objectKey;

  if (uploadId) {
    return abortStorefrontHeroImageUploadSession({
      userId,
      uploadId,
      objectKey,
    });
  }

  if (objectKey) {
    return deleteStorefrontTemporaryUpload({
      userId,
      objectKey,
    });
  }

  return false;
};

export const getPublicStorefrontHeroImageAsset = async (photoUrl) =>
  downloadStorefrontManagedHeroImage(photoUrl);

const buildStorefrontLineNotes = ({
  packName = "",
  selectedOptions = [],
  existingNotes = "",
} = {}) =>
  [packName ? `Pack: ${packName}` : "", selectedOptions.length ? `Options: ${selectedOptions.map((option) => option.name).join(", ")}` : "", existingNotes]
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean)
    .join(" | ");

const resolveSelectedOptionsForProduct = (product, optionIds = []) => {
  const availableOptions = Array.isArray(product.options) ? product.options : [];
  const optionsById = new Map(availableOptions.map((option) => [option.id, option]));
  const selectedOptions = optionIds.map((optionId) => optionsById.get(optionId)).filter(Boolean);

  if (selectedOptions.length !== optionIds.length) {
    throw new HttpError(400, "Une option selectionnee n'est pas disponible pour ce produit.");
  }

  const missingRequiredOption = availableOptions.find(
    (option) => option.required && !optionIds.includes(option.id)
  );

  if (missingRequiredOption) {
    throw new HttpError(
      400,
      `L'option "${missingRequiredOption.name}" est obligatoire pour ce produit.`
    );
  }

  return selectedOptions;
};

const buildReservationLinesFromCartItems = (preview, payload = {}) => {
  const rawCartItems = Array.isArray(payload.cart_items ?? payload.cartItems)
    ? payload.cart_items ?? payload.cartItems
    : [];
  const cartItems = rawCartItems.map(normalizeCartItem).filter((entry) => {
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) {
      throw new HttpError(400, "La quantite d'un element du panier est invalide.");
    }

    return Boolean(entry.item_id || entry.pack_id);
  });

  if (!cartItems.length) {
    return {
      reservationLines: mergeRequestLines(payload.lines),
      cartSummary: "",
    };
  }

  const productsById = new Map(preview.products.map((product) => [product.id, product]));
  const packsById = new Map(preview.packs.map((pack) => [pack.id, pack]));
  const expandedLines = [];
  const cartSummaryParts = [];

  cartItems.forEach((entry) => {
    if (entry.entry_type === "pack") {
      const pack = packsById.get(entry.pack_id);

      if (!pack) {
        throw new HttpError(404, "Un pack du panier n'est pas visible en boutique.");
      }

      cartSummaryParts.push(`${entry.quantity} x pack ${pack.name}`);

      const baseCentsByProduct = pack.products.map((product) => toMoneyCents(product.price));
      const totalPackPriceCents = applyDiscountToTotalCents(
        baseCentsByProduct.reduce((sum, value) => sum + value, 0),
        pack.discount_type,
        pack.discount_value
      );
      const allocatedPackPrices = allocateMoneyCents(baseCentsByProduct, totalPackPriceCents);

      pack.products.forEach((product, index) => {
        expandedLines.push({
          item_id: product.item_id,
          quantity: entry.quantity,
          unit_price: fromMoneyCents(allocatedPackPrices[index]),
          notes: buildStorefrontLineNotes({
            packName: pack.name,
          }),
          merge_key: `pack:${pack.id}:item:${product.item_id}`,
        });
      });

      return;
    }

    const product = productsById.get(entry.item_id);

    if (!product) {
      throw new HttpError(404, "Un produit du panier n'est pas visible en boutique.");
    }

    const selectedOptions = resolveSelectedOptionsForProduct(product, entry.option_ids);
    const optionsPrice = selectedOptions.reduce((sum, option) => sum + toNumber(option.price), 0);
    const optionNames = selectedOptions.map((option) => option.name);

    cartSummaryParts.push(
      `${entry.quantity} x ${product.public_name}${optionNames.length ? ` (${optionNames.join(", ")})` : ""}`
    );
    expandedLines.push({
      item_id: product.id,
      quantity: entry.quantity,
      unit_price: toNumber(product.price) + optionsPrice,
      notes: buildStorefrontLineNotes({
        selectedOptions,
      }),
      merge_key: `product:${product.id}:options:${entry.option_ids.sort().join(",") || "none"}`,
    });
  });

  return {
    reservationLines: mergeRequestLines(expandedLines),
    cartSummary: cartSummaryParts.join(" | "),
  };
};

const prepareStorefrontReservationRequest = async (userId, payload = {}, options = {}) => {
  const customer = normalizeCustomerPayload(payload.customer);
  const startDate = String(payload.start_date ?? payload.startDate ?? "").trim();
  const endDate = String(payload.end_date ?? payload.endDate ?? "").trim();
  const fulfillmentMode =
    String(payload.fulfillment_mode ?? payload.fulfillmentMode ?? "pickup").trim() || "pickup";
  const notes = normalizeWhitespace(payload.notes ?? "");
  const storefrontSettings = options.storefrontSettings || (await ensureStorefrontSettingsRecord(userId));

  if (!customer.first_name || !customer.last_name || !customer.email) {
    throw new HttpError(400, "Les informations client sont obligatoires pour la boutique.");
  }

  if (!allowedFulfillmentModes.has(fulfillmentMode)) {
    throw new HttpError(400, "Mode logistique invalide pour la boutique.");
  }

  const preview = await buildStorefrontPayload(userId, {
    start: startDate,
    end: endDate,
    storefrontSettings,
    storefrontOwner: options.storefrontOwner || null,
  });
  const { reservationLines: lines, cartSummary } = buildReservationLinesFromCartItems(
    preview,
    payload
  );

  if (!lines.length) {
    throw new HttpError(400, "Ajoutez au moins un produit a la reservation.");
  }

  lines.forEach((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new HttpError(400, "La quantite d'un produit est invalide.");
    }
  });

  const visibleProductsById = new Map(preview.products.map((product) => [product.id, product]));
  const requestedQuantityByItemId = new Map();
  const durationInDays = calculateStorefrontDurationInDays(startDate, endDate);

  lines.forEach((line) => {
    requestedQuantityByItemId.set(
      line.item_id,
      (requestedQuantityByItemId.get(line.item_id) || 0) + Number(line.quantity || 0)
    );
  });

  requestedQuantityByItemId.forEach((requestedQuantity, itemId) => {
    const visibleProduct = visibleProductsById.get(itemId);

    if (!visibleProduct) {
      throw new HttpError(404, "Un produit du panier n'est pas visible en boutique.");
    }

    if (visibleProduct.available_quantity < requestedQuantity) {
      throw buildAvailabilityConflictError(visibleProduct, requestedQuantity);
    }
  });

  const totalAmount = lines.reduce((sum, line) => {
    return sum + Number(line.unit_price || 0) * Number(line.quantity || 0) * durationInDays;
  }, 0);
  const totalDeposit = lines.reduce((sum, line) => {
    const product = visibleProductsById.get(line.item_id);
    return sum + Number(product?.deposit || 0) * Number(line.quantity || 0);
  }, 0);

  return {
    customer,
    startDate,
    endDate,
    durationInDays,
    fulfillmentMode,
    notes,
    preview,
    storefrontSettings,
    lines,
    cartSummary,
    totalAmount,
    totalDeposit,
  };
};

export const submitStorefrontRequest = async (userId, payload = {}, options = {}) => {
  const {
    customer,
    startDate,
    endDate,
    fulfillmentMode,
    notes,
    storefrontSettings,
    lines,
    cartSummary,
  } = await prepareStorefrontReservationRequest(userId, payload, options);

  let client = await findExistingClient(userId, customer);

  if (client?.archived_at) {
    client = await restoreClient(userId, client.id, {
      actorUserId: userId,
      restoreReason: "Reactivation automatique depuis la boutique en ligne",
    });
  }

  if (!client) {
    client = await createClient(userId, customer);
  }

  const reservationStatus =
    storefrontSettings.reservation_approval_mode === "automatic" ? "confirmed" : "pending";
  const reservation = await createReservation(userId, {
    client_id: client.id,
    start_date: startDate,
    end_date: endDate,
    status: reservationStatus,
    source: "web",
    fulfillment_mode: fulfillmentMode,
    notes: ["Demande boutique en ligne", cartSummary ? `Panier: ${cartSummary}` : "", notes]
      .filter(Boolean)
      .join(" - "),
    lines,
    deposit: {
      handling_mode: "manual",
      manual_status: "pending",
      notes: "Caution signalee depuis la boutique en ligne.",
    },
  });

  try {
    await notifyProviderAboutStorefrontReservation({
      userId,
      reservation,
      client,
      cartSummary,
      customerMessage: notes || customer.notes || "",
    });
  } catch (error) {
    console.error("Storefront provider notification failed", {
      userId,
      reservationId: reservation.id,
      message: error.message,
    });
  }

  return {
    client,
    reservation,
    storefront: {
      approval_mode: storefrontSettings.reservation_approval_mode,
      slug: storefrontSettings.slug,
    },
  };
};

const createStorefrontCheckoutRecord = async ({
  userId,
  storefrontSlug,
  stripeAccountId,
  stripeSessionId,
  checkoutUrl,
  requestPayload,
  amountTotal,
  depositTotal,
}) => {
  await query(
    `
      INSERT INTO storefront_checkout_sessions (
        id,
        stripe_session_id,
        user_id,
        storefront_slug,
        stripe_account_id,
        checkout_status,
        amount_total,
        deposit_total,
        request_payload_json,
        checkout_url
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
    `,
    [
      crypto.randomUUID(),
      stripeSessionId,
      userId,
      storefrontSlug,
      stripeAccountId,
      amountTotal,
      depositTotal,
      JSON.stringify(requestPayload),
      checkoutUrl,
    ]
  );
};

const getStorefrontCheckoutSessionRow = async (sessionId) => {
  const { rows } = await query(
    `
      SELECT *
      FROM storefront_checkout_sessions
      WHERE stripe_session_id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] || null;
};

const buildStorefrontCheckoutUrls = ({
  storefrontSlug,
  previewMode = false,
} = {}) => {
  const successUrl = new URL(`/shop/${storefrontSlug}`, env.clientUrl);
  const cancelUrl = new URL(`/shop/${storefrontSlug}`, env.clientUrl);

  if (previewMode) {
    successUrl.searchParams.set("preview", "1");
    cancelUrl.searchParams.set("preview", "1");
  }

  successUrl.searchParams.set("checkout", "success");
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  cancelUrl.searchParams.set("checkout", "cancel");

  return {
    successUrl: successUrl.toString(),
    cancelUrl: cancelUrl.toString(),
  };
};

export const createStorefrontCheckoutSession = async (userId, payload = {}, options = {}) => {
  const paymentSettings = await getCustomerPaymentSettings(userId);

  if (!paymentSettings.onlinePayment?.canEnable || !paymentSettings.onlinePayment?.enabled) {
    throw new HttpError(
      409,
      "Le paiement en ligne n'est pas disponible pour cette boutique."
    );
  }

  const {
    customer,
    startDate,
    endDate,
    durationInDays,
    preview,
    storefrontSettings,
    cartSummary,
    totalAmount,
    totalDeposit,
  } = await prepareStorefrontReservationRequest(userId, payload, options);
  const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();
  const { successUrl, cancelUrl } = buildStorefrontCheckoutUrls({
    storefrontSlug: storefrontSettings.slug,
    previewMode: Boolean(payload.preview_mode ?? payload.previewMode ?? false),
  });
  const session = await createConnectedAccountCheckoutSession({
    secretKey: platformStripeConfig.secretKey,
    accountId: paymentSettings.stripe.accountId,
    successUrl,
    cancelUrl,
    customerEmail: customer.email,
    amountCents: toMoneyCents(totalAmount),
    lineItemName: `${preview.storefront.display_name} - reservation en ligne`,
    lineItemDescription:
      cartSummary ||
      `Reservation boutique du ${startDate} au ${endDate} (${durationInDays} jour(s))`,
    metadata: {
      userId,
      storefrontSlug: storefrontSettings.slug,
      paymentFlow: "storefront_online_payment",
    },
  });

  await createStorefrontCheckoutRecord({
    userId,
    storefrontSlug: storefrontSettings.slug,
    stripeAccountId: paymentSettings.stripe.accountId,
    stripeSessionId: session.id,
    checkoutUrl: session.url,
    requestPayload: {
      ...payload,
      customer,
      start_date: startDate,
      end_date: endDate,
      preview_mode: Boolean(payload.preview_mode ?? payload.previewMode ?? false),
    },
    amountTotal: totalAmount,
    depositTotal: totalDeposit,
  });

  return {
    checkout: {
      session_id: session.id,
      url: session.url,
      amount_total: totalAmount,
      deposit_total: totalDeposit,
    },
  };
};

export const finalizeStorefrontCheckoutSession = async (
  userId,
  sessionId,
  options = {}
) => {
  const checkoutRow = await getStorefrontCheckoutSessionRow(sessionId);

  if (!checkoutRow || checkoutRow.user_id !== userId) {
    throw new HttpError(404, "Session de paiement introuvable.");
  }

  if (checkoutRow.reservation_id) {
    try {
      return {
        checkout: {
          session_id: sessionId,
          status: checkoutRow.checkout_status,
        },
        reservation: await getReservationById(userId, checkoutRow.reservation_id),
      };
    } catch (_error) {
      // Ignore a stale reservation link and continue the Stripe verification path below.
    }
  }

  const platformStripeConfig = await getResolvedSuperAdminStripeConfiguration();
  const session = await retrieveConnectedAccountCheckoutSession({
    secretKey: platformStripeConfig.secretKey,
    accountId: checkoutRow.stripe_account_id,
    sessionId,
  });

  if (session.payment_status !== "paid") {
    throw new HttpError(409, "Le paiement Stripe n'est pas encore confirme.");
  }

  const result = await submitStorefrontRequest(
    userId,
    parseJsonObject(checkoutRow.request_payload_json),
    options
  );

  await query(
    `
      UPDATE storefront_checkout_sessions
      SET checkout_status = 'completed',
          reservation_id = $2,
          checkout_completed_at = NOW(),
          finalized_at = NOW(),
          updated_at = NOW()
      WHERE stripe_session_id = $1
    `,
    [sessionId, result.reservation.id]
  );

  return {
    checkout: {
      session_id: sessionId,
      status: "completed",
    },
    reservation: result.reservation,
  };
};

export const submitPublicStorefrontRequest = async (slug, payload = {}) => {
  const storefront = await resolveStorefrontOwnerBySlug(slug, {
    requirePublished: true,
  });

  return submitStorefrontRequest(storefront.user_id, payload, {
    storefrontSettings: storefront.settings,
    storefrontOwner: storefront.owner,
  });
};

export const createPublicStorefrontCheckoutSession = async (slug, payload = {}) => {
  const storefront = await resolveStorefrontOwnerBySlug(slug, {
    requirePublished: true,
  });

  return createStorefrontCheckoutSession(storefront.user_id, payload, {
    storefrontSettings: storefront.settings,
    storefrontOwner: storefront.owner,
  });
};

export const finalizePublicStorefrontCheckoutSession = async (slug, sessionId) => {
  const storefront = await resolveStorefrontOwnerBySlug(slug, {
    requirePublished: true,
  });

  return finalizeStorefrontCheckoutSession(storefront.user_id, sessionId, {
    storefrontSettings: storefront.settings,
    storefrontOwner: storefront.owner,
  });
};
