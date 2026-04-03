import {
  DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_SIZE_BYTES,
  MIN_IMAGE_UPLOAD_SIZE_BYTES,
  formatImageUploadSize,
  prepareImageUpload,
} from "./image-upload";

export const MAX_CATALOG_ITEM_PHOTOS = 8;
export const MAX_CATALOG_IMAGE_SIZE_BYTES = MAX_IMAGE_UPLOAD_SIZE_BYTES;
export const MIN_CATALOG_IMAGE_SIZE_BYTES = MIN_IMAGE_UPLOAD_SIZE_BYTES;
export const MIN_CATALOG_IMAGE_WIDTH = 600;
export const MIN_CATALOG_IMAGE_HEIGHT = 600;

export const formatCatalogImageSize = formatImageUploadSize;

export const prepareCatalogImage = async (file) =>
  prepareImageUpload(file, {
    allowedMimeTypes: DEFAULT_ALLOWED_IMAGE_MIME_TYPES,
    maxSizeBytes: MAX_CATALOG_IMAGE_SIZE_BYTES,
    minSizeBytes: MIN_CATALOG_IMAGE_SIZE_BYTES,
    minWidth: MIN_CATALOG_IMAGE_WIDTH,
    minHeight: MIN_CATALOG_IMAGE_HEIGHT,
    includeDataUrl: true,
  });
