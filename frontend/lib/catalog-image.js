export const MAX_CATALOG_ITEM_PHOTOS = 8;
export const MAX_CATALOG_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
export const MIN_CATALOG_IMAGE_SIZE_BYTES = 10 * 1024;
export const MIN_CATALOG_IMAGE_WIDTH = 600;
export const MIN_CATALOG_IMAGE_HEIGHT = 600;

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const buildCatalogImageError = (message, code) => {
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
        buildCatalogImageError(
          "Le fichier image n'a pas pu etre ouvert.",
          "catalog_image_invalid"
        )
      );
    image.src = src;
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(
        buildCatalogImageError(
          "Le fichier image n'a pas pu etre lu.",
          "catalog_image_invalid"
        )
      );
    reader.readAsDataURL(file);
  });

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

    const dataUrl = await readFileAsDataUrl(file);

    return {
      id: globalThis.crypto?.randomUUID?.() || `photo-${Date.now()}`,
      fileName: file.name,
      mimeType: file.type,
      width: image.naturalWidth,
      height: image.naturalHeight,
      sizeBytes: file.size,
      dataUrl,
      previewUrl: dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
