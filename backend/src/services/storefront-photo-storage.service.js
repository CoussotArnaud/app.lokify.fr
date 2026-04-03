import crypto from "crypto";

import sharp from "sharp";

import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createR2MultipartUpload,
  deleteR2Object,
  downloadR2Object,
  extractR2ObjectKeyFromPublicUrl,
  headR2Object,
  isManagedR2PublicUrl,
  uploadR2MultipartPart,
  uploadR2Object,
} from "./cloudflare-r2.service.js";
import {
  buildImageTooLargeMessage,
  DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_SIZE_BYTES,
  validateImageUploadAsset,
} from "../utils/image-upload.js";
import HttpError from "../utils/http-error.js";

export const MAX_STOREFRONT_HERO_IMAGES = 5;
// R2 follows the S3 multipart minimum part size rules for non-final chunks.
const MULTIPART_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
const TEMP_UPLOAD_PREFIX = "storefront-temp";
const FINAL_UPLOAD_PREFIX = "storefronts";
const MAX_OUTPUT_DIMENSION = 1600;
const TARGET_OUTPUT_SIZE_BYTES = 500 * 1024;
const OUTPUT_QUALITY_STEPS = [84, 82, 80, 76, 72, 68];
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68];

const sanitizePathSegment = (value, fallback) =>
  String(value || "")
    .trim()
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || fallback;

const getMimeExtension = (mimeType) => {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
};

const buildStorefrontTempObjectKey = (userId, fileName = "") => {
  const fileExtension = fileName.includes(".")
    ? sanitizePathSegment(fileName.split(".").pop(), "bin")
    : "bin";

  return [
    TEMP_UPLOAD_PREFIX,
    sanitizePathSegment(userId, "provider"),
    `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${fileExtension}`,
  ].join("/");
};

const buildStorefrontManagedImageObjectKey = (userId, mimeType) => {
  const extension = getMimeExtension(mimeType);

  return [
    FINAL_UPLOAD_PREFIX,
    sanitizePathSegment(userId, "provider"),
    "hero",
    `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`,
  ].join("/");
};

const assertOwnedStorefrontObjectKey = (userId, objectKey, expectedPrefix) => {
  const normalizedObjectKey = String(objectKey || "").trim();
  const normalizedPrefix = [
    expectedPrefix,
    sanitizePathSegment(userId, "provider"),
  ].join("/");

  if (!normalizedObjectKey || !normalizedObjectKey.startsWith(`${normalizedPrefix}/`)) {
    throw new HttpError(403, "Ce fichier image n'est pas accessible pour ce prestataire.", {
      code: "storefront_image_forbidden",
    });
  }

  return normalizedObjectKey;
};

const decodeBase64Chunk = (value) => {
  const normalizedValue = String(value || "").trim().replace(/\s+/g, "");

  if (!normalizedValue) {
    throw new HttpError(400, "Le morceau d'image est vide.", {
      code: "storefront_image_part_invalid",
    });
  }

  return Buffer.from(normalizedValue, "base64");
};

const optimizeStorefrontImage = async (validatedImage) => {
  const dominantDimension = Math.max(validatedImage.width, validatedImage.height);
  const canKeepOriginal =
    dominantDimension <= MAX_OUTPUT_DIMENSION &&
    validatedImage.size_bytes <= TARGET_OUTPUT_SIZE_BYTES;

  let bestResult = canKeepOriginal
    ? {
        buffer: validatedImage.buffer,
        mimeType: validatedImage.mime_type,
        sizeBytes: validatedImage.size_bytes,
        width: validatedImage.width,
        height: validatedImage.height,
      }
    : null;

  try {
    for (const scaleStep of SCALE_STEPS) {
      const maxDimension = Math.max(
        1,
        Math.round(
          Math.min(dominantDimension, MAX_OUTPUT_DIMENSION) * scaleStep
        )
      );

      for (const quality of OUTPUT_QUALITY_STEPS) {
        const optimizedBuffer = await sharp(validatedImage.buffer, { failOn: "error" })
          .rotate()
          .resize({
            width: maxDimension,
            height: maxDimension,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({
            quality,
            effort: 4,
          })
          .toBuffer();

        const metadata = await sharp(optimizedBuffer).metadata();
        const candidate = {
          buffer: optimizedBuffer,
          mimeType: "image/webp",
          sizeBytes: optimizedBuffer.byteLength,
          width: Number(metadata.width || validatedImage.width || 0),
          height: Number(metadata.height || validatedImage.height || 0),
        };

        if (!bestResult || candidate.sizeBytes < bestResult.sizeBytes) {
          bestResult = candidate;
        }

        if (candidate.sizeBytes <= TARGET_OUTPUT_SIZE_BYTES) {
          return candidate;
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

export const createStorefrontHeroImageUploadSession = async ({
  userId,
  fileName = "",
  mimeType = "",
  sizeBytes = 0,
}) => {
  if (!DEFAULT_ALLOWED_IMAGE_MIME_TYPES.has(String(mimeType || "").trim().toLowerCase())) {
    throw new HttpError(400, "Format d'image non pris en charge. Utilisez JPG, PNG ou WebP.", {
      code: "catalog_image_type",
    });
  }

  if (Number(sizeBytes || 0) <= 0) {
    throw new HttpError(400, "La taille du fichier image est invalide.", {
      code: "catalog_image_invalid",
    });
  }

  if (Number(sizeBytes || 0) > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    throw new HttpError(413, buildImageTooLargeMessage(MAX_IMAGE_UPLOAD_SIZE_BYTES), {
      code: "catalog_image_too_large",
    });
  }

  const objectKey = buildStorefrontTempObjectKey(userId, fileName);
  const upload = await createR2MultipartUpload({
    objectKey,
    contentType: mimeType,
    cacheControl: "private, max-age=0, no-store",
    metadata: {
      user_id: String(userId),
      upload_scope: "storefront_hero_temp",
    },
  });

  return {
    uploadId: upload.uploadId,
    objectKey,
    chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES,
    maxFileSizeBytes: MAX_IMAGE_UPLOAD_SIZE_BYTES,
  };
};

export const uploadStorefrontHeroImagePart = async ({
  userId,
  uploadId,
  objectKey,
  partNumber,
  dataBase64,
}) => {
  const resolvedObjectKey = assertOwnedStorefrontObjectKey(userId, objectKey, TEMP_UPLOAD_PREFIX);
  const resolvedPartNumber = Number(partNumber || 0);

  if (!uploadId || !resolvedPartNumber || resolvedPartNumber < 1) {
    throw new HttpError(400, "Le morceau d'image est invalide.", {
      code: "storefront_image_part_invalid",
    });
  }

  const buffer = decodeBase64Chunk(dataBase64);

  if (!buffer.byteLength || buffer.byteLength > MULTIPART_CHUNK_SIZE_BYTES) {
    throw new HttpError(400, "Le morceau d'image est invalide.", {
      code: "storefront_image_part_invalid",
    });
  }

  return uploadR2MultipartPart({
    objectKey: resolvedObjectKey,
    uploadId,
    partNumber: resolvedPartNumber,
    body: buffer,
  });
};

export const completeStorefrontHeroImageUploadSession = async ({
  userId,
  uploadId,
  objectKey,
  parts,
  clientId = "",
  fileName = "",
  mimeType = "",
  sizeBytes = 0,
}) => {
  const resolvedObjectKey = assertOwnedStorefrontObjectKey(userId, objectKey, TEMP_UPLOAD_PREFIX);

  if (!uploadId) {
    throw new HttpError(400, "La session d'envoi est invalide.", {
      code: "storefront_image_upload_invalid",
    });
  }

  await completeR2MultipartUpload({
    objectKey: resolvedObjectKey,
    uploadId,
    parts,
  });

  const head = await headR2Object(resolvedObjectKey);
  if (head.contentLength > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    await deleteR2Object(resolvedObjectKey);
    throw new HttpError(413, buildImageTooLargeMessage(MAX_IMAGE_UPLOAD_SIZE_BYTES), {
      code: "catalog_image_too_large",
    });
  }

  return {
    client_id: String(clientId || "").trim() || null,
    temp_object_key: resolvedObjectKey,
    file_name: String(fileName || "").trim() || null,
    mime_type: String(mimeType || head.contentType || "").trim().toLowerCase() || null,
    size_bytes: Number(sizeBytes || head.contentLength || 0),
  };
};

export const abortStorefrontHeroImageUploadSession = async ({
  userId,
  uploadId,
  objectKey,
}) => {
  if (uploadId) {
    const resolvedObjectKey = assertOwnedStorefrontObjectKey(userId, objectKey, TEMP_UPLOAD_PREFIX);
    await abortR2MultipartUpload({
      objectKey: resolvedObjectKey,
      uploadId,
    });
    return true;
  }

  return false;
};

export const deleteStorefrontTemporaryUpload = async ({ userId, objectKey }) => {
  const resolvedObjectKey = assertOwnedStorefrontObjectKey(userId, objectKey, TEMP_UPLOAD_PREFIX);
  await deleteR2Object(resolvedObjectKey);
  return true;
};

export const consumeStorefrontHeroImageTempUpload = async ({
  userId,
  tempObjectKey,
  fileName = "",
  mimeType = "",
}) => {
  const resolvedObjectKey = assertOwnedStorefrontObjectKey(userId, tempObjectKey, TEMP_UPLOAD_PREFIX);

  try {
    const downloadedObject = await downloadR2Object(resolvedObjectKey);
    const validatedImage = validateImageUploadAsset(
      {
        buffer: downloadedObject.body,
        mimeType: mimeType || downloadedObject.contentType,
        fileName,
      },
      {
        allowedMimeTypes: DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
        maxSizeBytes: MAX_IMAGE_UPLOAD_SIZE_BYTES,
        tooLargeMessage: buildImageTooLargeMessage(MAX_IMAGE_UPLOAD_SIZE_BYTES),
      }
    );
    const optimizedImage = await optimizeStorefrontImage(validatedImage);
    const finalObjectKey = buildStorefrontManagedImageObjectKey(userId, optimizedImage.mimeType);
    const uploadResult = await uploadR2Object({
      objectKey: finalObjectKey,
      body: optimizedImage.buffer,
      contentType: optimizedImage.mimeType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        user_id: String(userId),
        upload_scope: "storefront_hero",
        source_mime_type: validatedImage.mime_type,
      },
    });

    await deleteR2Object(resolvedObjectKey);

    return {
      url: uploadResult.publicUrl,
      width: optimizedImage.width,
      height: optimizedImage.height,
      size_bytes: optimizedImage.sizeBytes,
      mime_type: optimizedImage.mimeType,
      original_file_name: validatedImage.file_name,
      source_mime_type: validatedImage.mime_type,
    };
  } catch (error) {
    try {
      await deleteR2Object(resolvedObjectKey);
    } catch (_cleanupError) {
      // Ignore cleanup failures and preserve the original upload error.
    }

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(502, "L'image n'a pas pu etre envoyee.", {
      code: "catalog_image_upload_failed",
    });
  }
};

export const isManagedStorefrontHeroImageUrl = (photoUrl) => isManagedR2PublicUrl(photoUrl);

export const downloadStorefrontManagedHeroImage = async (photoUrl) => {
  const objectKey = extractR2ObjectKeyFromPublicUrl(photoUrl);
  if (!objectKey || !objectKey.startsWith(`${FINAL_UPLOAD_PREFIX}/`)) {
    throw new HttpError(404, "Image introuvable.", {
      code: "storefront_image_not_found",
    });
  }

  try {
    const downloadedObject = await downloadR2Object(objectKey);
    return {
      body: downloadedObject.body,
      contentType: downloadedObject.contentType || "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(404, "Image introuvable.", {
      code: "storefront_image_not_found",
    });
  }
};

export const deleteStorefrontManagedHeroImage = async (photoUrl) => {
  const objectKey = extractR2ObjectKeyFromPublicUrl(photoUrl);
  if (!objectKey) {
    return false;
  }

  await deleteR2Object(objectKey);
  return true;
};
