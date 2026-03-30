export const MAX_CATALOG_ITEM_PHOTOS = 8;
export const MAX_CATALOG_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
export const MIN_CATALOG_IMAGE_SIZE_BYTES = 10 * 1024;
export const MIN_CATALOG_IMAGE_WIDTH = 600;
export const MIN_CATALOG_IMAGE_HEIGHT = 600;

const MAX_OUTPUT_DIMENSION = 1600;
const TARGET_OUTPUT_SIZE_BYTES = 850 * 1024;
const OUTPUT_MIME_TYPE = "image/webp";
const OUTPUT_QUALITY_STEPS = [0.82, 0.76, 0.7, 0.64];
const SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68];
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const buildCatalogImageError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const decodeBase64Size = (dataUrl) => {
  const [, base64Payload = ""] = String(dataUrl || "").split(",", 2);
  const normalizedPayload = base64Payload.replace(/\s+/g, "");
  if (!normalizedPayload) {
    return 0;
  }

  const paddingLength = normalizedPayload.endsWith("==")
    ? 2
    : normalizedPayload.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalizedPayload.length * 3) / 4) - paddingLength);
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        buildCatalogImageError(
          "Le fichier image n'a pas pu etre ouvert.",
          "catalog_image_invalid"
        )
      );
    image.src = src;
  });

const createCanvas = (image, width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw buildCatalogImageError(
      "Le navigateur ne permet pas de preparer cette image.",
      "catalog_image_processing_failed"
    );
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas;
};

export const formatCatalogImageSize = (bytes) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  return `${Math.round(bytes / 1024)} Ko`;
};

export const prepareCatalogImage = async (file) => {
  if (!(file instanceof File)) {
    throw buildCatalogImageError("Aucune image n'a ete selectionnee.", "catalog_image_missing");
  }

  if (!allowedMimeTypes.has(file.type)) {
    throw buildCatalogImageError(
      "Format non pris en charge. Utilisez une image JPG, PNG ou WebP.",
      "catalog_image_type"
    );
  }

  if (file.size > MAX_CATALOG_IMAGE_SIZE_BYTES) {
    throw buildCatalogImageError(
      `L'image depasse la limite autorisee de ${Math.round(
        MAX_CATALOG_IMAGE_SIZE_BYTES / (1024 * 1024)
      )} Mo.`,
      "catalog_image_too_large"
    );
  }

  if (file.size < MIN_CATALOG_IMAGE_SIZE_BYTES) {
    throw buildCatalogImageError(
      "L'image est trop petite pour etre exploitable.",
      "catalog_image_too_small"
    );
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);

    if (
      image.naturalWidth < MIN_CATALOG_IMAGE_WIDTH ||
      image.naturalHeight < MIN_CATALOG_IMAGE_HEIGHT
    ) {
      throw buildCatalogImageError(
        `L'image doit mesurer au moins ${MIN_CATALOG_IMAGE_WIDTH} x ${MIN_CATALOG_IMAGE_HEIGHT} px.`,
        "catalog_image_dimensions"
      );
    }

    const dominantDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const baseScale =
      dominantDimension > MAX_OUTPUT_DIMENSION
        ? MAX_OUTPUT_DIMENSION / dominantDimension
        : 1;

    let preparedDataUrl = "";
    let preparedWidth = image.naturalWidth;
    let preparedHeight = image.naturalHeight;

    for (const scaleStep of SCALE_STEPS) {
      const width = Math.max(
        MIN_CATALOG_IMAGE_WIDTH,
        Math.round(image.naturalWidth * baseScale * scaleStep)
      );
      const height = Math.max(
        MIN_CATALOG_IMAGE_HEIGHT,
        Math.round(image.naturalHeight * baseScale * scaleStep)
      );
      const canvas = createCanvas(image, width, height);

      for (const quality of OUTPUT_QUALITY_STEPS) {
        const candidateDataUrl = canvas.toDataURL(OUTPUT_MIME_TYPE, quality);
        const candidateSize = decodeBase64Size(candidateDataUrl);

        preparedDataUrl = candidateDataUrl;
        preparedWidth = width;
        preparedHeight = height;

        if (candidateSize <= TARGET_OUTPUT_SIZE_BYTES) {
          return {
            id: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}`,
            fileName: file.name,
            mimeType: OUTPUT_MIME_TYPE,
            width,
            height,
            sizeBytes: candidateSize,
            dataUrl: candidateDataUrl,
            previewUrl: candidateDataUrl,
          };
        }
      }
    }

    return {
      id: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}`,
      fileName: file.name,
      mimeType: OUTPUT_MIME_TYPE,
      width: preparedWidth,
      height: preparedHeight,
      sizeBytes: decodeBase64Size(preparedDataUrl),
      dataUrl: preparedDataUrl,
      previewUrl: preparedDataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
