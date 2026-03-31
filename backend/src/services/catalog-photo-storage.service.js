import crypto from "crypto";

import sharp from "sharp";

import {
  deleteR2Object,
  extractR2ObjectKeyFromPublicUrl,
  isManagedR2PublicUrl,
  uploadR2Object,
} from "./cloudflare-r2.service.js";
import {
  MIN_CATALOG_IMAGE_HEIGHT,
  MIN_CATALOG_IMAGE_WIDTH,
  parseCatalogImagePayload,
  validateCatalogImageAsset,
} from "../utils/catalog-image.js";
import HttpError from "../utils/http-error.js";

const MAX_OUTPUT_DIMENSION = 1600;
const TARGET_OUTPUT_SIZE_BYTES = 850 * 1024;
const OUTPUT_QUALITY_STEPS = [82, 76, 70, 64];
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68];
const OUTPUT_MIME_TYPE = "image/webp";

const uniqueResizeTargets = (targets = []) => {
  const seen = new Set();
  const uniqueTargets = [];

  targets.forEach((target) => {
    const key = `${target.width}x${target.height}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    uniqueTargets.push(target);
  });

  return uniqueTargets;
};

const buildResizeTargets = (width, height) => {
  const dominantDimension = Math.max(width, height);
  const baseScale =
    dominantDimension > MAX_OUTPUT_DIMENSION ? MAX_OUTPUT_DIMENSION / dominantDimension : 1;

  return uniqueResizeTargets(
    SCALE_STEPS.map((scaleStep) => ({
      width: Math.max(MIN_CATALOG_IMAGE_WIDTH, Math.round(width * baseScale * scaleStep)),
      height: Math.max(MIN_CATALOG_IMAGE_HEIGHT, Math.round(height * baseScale * scaleStep)),
    }))
  );
};

const optimizeCatalogImage = async (buffer, originalWidth, originalHeight) => {
  let bestResult = null;

  try {
    const resizeTargets = buildResizeTargets(originalWidth, originalHeight);

    for (const resizeTarget of resizeTargets) {
      for (const quality of OUTPUT_QUALITY_STEPS) {
        const optimizedBuffer = await sharp(buffer, { failOn: "error" })
          .rotate()
          .resize(resizeTarget.width, resizeTarget.height, {
            fit: "fill",
            withoutEnlargement: true,
          })
          .webp({
            quality,
            effort: 4,
          })
          .toBuffer();

        bestResult = {
          buffer: optimizedBuffer,
          mimeType: OUTPUT_MIME_TYPE,
          sizeBytes: optimizedBuffer.byteLength,
          width: resizeTarget.width,
          height: resizeTarget.height,
        };

        if (optimizedBuffer.byteLength <= TARGET_OUTPUT_SIZE_BYTES) {
          return bestResult;
        }
      }
    }
  } catch (_error) {
    throw new HttpError(400, "L'image envoyee n'a pas pu etre preparee.", {
      code: "catalog_image_processing_failed",
    });
  }

  if (!bestResult) {
    throw new HttpError(400, "L'image envoyee n'a pas pu etre preparee.", {
      code: "catalog_image_processing_failed",
    });
  }

  return bestResult;
};

const buildCatalogManagedImageObjectKey = (entityKind, entityId, assetKind = "default") => {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(5).toString("hex");
  const normalizedEntityKind =
    String(entityKind || "")
      .trim()
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "catalog";
  const normalizedAssetKind =
    String(assetKind || "")
      .trim()
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "default";

  return `${normalizedEntityKind}/${entityId}/${normalizedAssetKind}-${timestamp}-${randomSuffix}.webp`;
};

const uploadCatalogManagedImage = async ({
  entityKind,
  entityId,
  assetKind = "default",
  payload = {},
  metadata = {},
}) => {
  if (!entityId) {
    throw new HttpError(400, "L'image n'a pas pu etre rattachee a son element.", {
      code: "catalog_image_missing_owner",
    });
  }

  const parsedImage = parseCatalogImagePayload(payload);
  const validatedImage = validateCatalogImageAsset(parsedImage);
  const optimizedImage = await optimizeCatalogImage(
    validatedImage.buffer,
    validatedImage.width,
    validatedImage.height
  );
  const objectKey = buildCatalogManagedImageObjectKey(entityKind, entityId, assetKind);

  try {
    const uploadResult = await uploadR2Object({
      objectKey,
      body: optimizedImage.buffer,
      contentType: optimizedImage.mimeType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        entity_id: String(entityId),
        source_mime_type: validatedImage.mime_type,
        ...metadata,
      },
    });

    return {
      ...uploadResult,
      width: optimizedImage.width,
      height: optimizedImage.height,
      sizeBytes: optimizedImage.sizeBytes,
      mimeType: optimizedImage.mimeType,
      originalFileName: validatedImage.file_name,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(502, "L'image n'a pas pu etre envoyee.", {
      code: "catalog_image_upload_failed",
    });
  }
};

export const uploadCatalogProductPhoto = async ({ itemId, payload = {} }) =>
  uploadCatalogManagedImage({
    entityKind: "products",
    entityId: itemId,
    assetKind: "gallery",
    payload,
    metadata: {
      item_id: String(itemId),
    },
  });

export const uploadCatalogCategoryImage = async ({
  categoryId,
  imageKind = "thumbnail",
  payload = {},
}) =>
  uploadCatalogManagedImage({
    entityKind: "categories",
    entityId: categoryId,
    assetKind: imageKind,
    payload,
    metadata: {
      category_id: String(categoryId),
      image_kind: String(imageKind || "thumbnail"),
    },
  });

export const isManagedCatalogPhotoUrl = (photoUrl) => isManagedR2PublicUrl(photoUrl);

export const deleteCatalogManagedPhoto = async (photoUrl) => {
  const objectKey = extractR2ObjectKeyFromPublicUrl(photoUrl);
  if (!objectKey) {
    return false;
  }

  await deleteR2Object(objectKey);
  return true;
};
