import HttpError from "./http-error.js";

export const MAX_CATALOG_ITEM_PHOTOS = 8;
export const MAX_CATALOG_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
export const MIN_CATALOG_IMAGE_SIZE_BYTES = 10 * 1024;
export const MIN_CATALOG_IMAGE_WIDTH = 600;
export const MIN_CATALOG_IMAGE_HEIGHT = 600;

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const parseImageDataUrl = (value) => {
  const normalizedValue = String(value || "").trim();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(normalizedValue);

  if (!match) {
    throw new HttpError(400, "L'image envoyee est invalide.", {
      code: "catalog_image_invalid",
    });
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64Payload = String(match[2] || "").replace(/\s+/g, "");
  const buffer = Buffer.from(base64Payload, "base64");

  if (!buffer.length) {
    throw new HttpError(400, "L'image envoyee est vide.", {
      code: "catalog_image_invalid",
    });
  }

  return {
    dataUrl: `data:${mimeType};base64,${base64Payload}`,
    mimeType,
    buffer,
  };
};

const getPngDimensions = (buffer) => {
  if (
    buffer.length < 24 ||
    buffer.readUInt32BE(0) !== 0x89504e47 ||
    buffer.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    throw new HttpError(400, "Le fichier PNG est invalide.", {
      code: "catalog_image_invalid",
    });
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const getJpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new HttpError(400, "Le fichier JPG est invalide.", {
      code: "catalog_image_invalid",
    });
  }

  let offset = 2;

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) {
      offset += 1;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    let marker = buffer[offset + 1];
    offset += 2;

    while (marker === 0xff && offset < buffer.length) {
      marker = buffer[offset];
      offset += 1;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  throw new HttpError(400, "Les dimensions de l'image n'ont pas pu etre lues.", {
    code: "catalog_image_invalid",
  });
};

const getWebpDimensions = (buffer) => {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new HttpError(400, "Le fichier WebP est invalide.", {
      code: "catalog_image_invalid",
    });
  }

  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkOffset = offset + 8;

    if (chunkOffset + chunkSize > buffer.length) {
      break;
    }

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: 1 + buffer.readUIntLE(chunkOffset + 4, 3),
        height: 1 + buffer.readUIntLE(chunkOffset + 7, 3),
      };
    }

    if (chunkType === "VP8 " && chunkSize >= 10) {
      return {
        width: buffer.readUInt16LE(chunkOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(chunkOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5) {
      const b1 = buffer[chunkOffset + 1];
      const b2 = buffer[chunkOffset + 2];
      const b3 = buffer[chunkOffset + 3];
      const b4 = buffer[chunkOffset + 4];

      return {
        width: 1 + (b1 | ((b2 & 0x3f) << 8)),
        height: 1 + (((b2 & 0xc0) >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
      };
    }

    offset = chunkOffset + chunkSize + (chunkSize % 2);
  }

  throw new HttpError(400, "Les dimensions de l'image n'ont pas pu etre lues.", {
    code: "catalog_image_invalid",
  });
};

const getImageDimensions = (buffer, mimeType) => {
  if (mimeType === "image/png") {
    return getPngDimensions(buffer);
  }

  if (mimeType === "image/jpeg") {
    return getJpegDimensions(buffer);
  }

  if (mimeType === "image/webp") {
    return getWebpDimensions(buffer);
  }

  throw new HttpError(400, "Format d'image non pris en charge.", {
    code: "catalog_image_type",
  });
};

export const validateCatalogImagePayload = (payload = {}) => {
  const parsedImage = parseImageDataUrl(payload.data_url ?? payload.dataUrl);

  if (!allowedMimeTypes.has(parsedImage.mimeType)) {
    throw new HttpError(400, "Format d'image non pris en charge. Utilisez JPG, PNG ou WebP.", {
      code: "catalog_image_type",
    });
  }

  if (parsedImage.buffer.byteLength > MAX_CATALOG_IMAGE_SIZE_BYTES) {
    throw new HttpError(
      413,
      `L'image depasse la taille maximale autorisee de ${Math.round(
        MAX_CATALOG_IMAGE_SIZE_BYTES / (1024 * 1024)
      )} Mo.`,
      { code: "catalog_image_too_large" }
    );
  }

  if (parsedImage.buffer.byteLength < MIN_CATALOG_IMAGE_SIZE_BYTES) {
    throw new HttpError(400, "L'image est trop petite pour etre exploitable.", {
      code: "catalog_image_too_small",
    });
  }

  const dimensions = getImageDimensions(parsedImage.buffer, parsedImage.mimeType);

  if (
    dimensions.width < MIN_CATALOG_IMAGE_WIDTH ||
    dimensions.height < MIN_CATALOG_IMAGE_HEIGHT
  ) {
    throw new HttpError(
      400,
      `L'image doit mesurer au moins ${MIN_CATALOG_IMAGE_WIDTH} x ${MIN_CATALOG_IMAGE_HEIGHT} px.`,
      { code: "catalog_image_dimensions" }
    );
  }

  return {
    data_url: parsedImage.dataUrl,
    mime_type: parsedImage.mimeType,
    size_bytes: parsedImage.buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    file_name: String(payload.file_name ?? payload.fileName ?? "").trim() || null,
  };
};
