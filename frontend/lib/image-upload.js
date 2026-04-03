export const MAX_IMAGE_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_UPLOAD_SIZE_BYTES = 10 * 1024;
export const DEFAULT_ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const formatImageUploadSize = (bytes) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  return `${Math.round(bytes / 1024)} Ko`;
};

export const buildImageUploadError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        buildImageUploadError(
          "Le fichier image n'a pas pu etre ouvert.",
          "catalog_image_invalid"
        )
      );
    image.src = src;
  });

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(
        buildImageUploadError(
          "Le fichier image n'a pas pu etre lu.",
          "catalog_image_invalid"
        )
      );
    reader.readAsDataURL(file);
  });

export const prepareImageUpload = async (
  file,
  {
    allowedMimeTypes = DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
    maxSizeBytes = MAX_IMAGE_UPLOAD_SIZE_BYTES,
    minSizeBytes = MIN_IMAGE_UPLOAD_SIZE_BYTES,
    minWidth = 0,
    minHeight = 0,
    includeDataUrl = false,
  } = {}
) => {
  if (!(file instanceof File)) {
    throw buildImageUploadError("Aucune image n'a ete selectionnee.", "catalog_image_missing");
  }

  if (!allowedMimeTypes.has(file.type)) {
    throw buildImageUploadError(
      "Format non pris en charge. Utilisez une image JPG, PNG ou WebP.",
      "catalog_image_type"
    );
  }

  if (file.size > maxSizeBytes) {
    throw buildImageUploadError(
      `Le fichier est trop volumineux. Taille maximale autorisee : ${Math.round(
        maxSizeBytes / (1024 * 1024)
      )} Mo.`,
      "catalog_image_too_large"
    );
  }

  if (file.size < minSizeBytes) {
    throw buildImageUploadError(
      "L'image est trop petite pour etre exploitable.",
      "catalog_image_too_small"
    );
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);

    if (minWidth > 0 && minHeight > 0 && (image.naturalWidth < minWidth || image.naturalHeight < minHeight)) {
      throw buildImageUploadError(
        `L'image doit mesurer au moins ${minWidth} x ${minHeight} px.`,
        "catalog_image_dimensions"
      );
    }

    const dataUrl = includeDataUrl ? await readFileAsDataUrl(file) : "";

    return {
      id: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}`,
      file,
      fileName: file.name,
      mimeType: file.type,
      width: image.naturalWidth,
      height: image.naturalHeight,
      sizeBytes: file.size,
      dataUrl,
      previewUrl: includeDataUrl ? dataUrl : objectUrl,
    };
  } finally {
    if (includeDataUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
};
