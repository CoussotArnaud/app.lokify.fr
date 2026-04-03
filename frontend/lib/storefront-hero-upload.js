import { apiRequest } from "./api";

const DEFAULT_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

const readBlobAsBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64Payload = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64Payload);
    };
    reader.onerror = () => reject(new Error("Le morceau d'image n'a pas pu etre lu."));
    reader.readAsDataURL(blob);
  });

export const uploadStorefrontHeroImage = async (photo) => {
  const file = photo?.file;

  if (!(file instanceof File)) {
    throw new Error("Aucun fichier image n'a ete selectionne.");
  }

  const createdUpload = await apiRequest("/storefront/settings/hero-images/uploads", {
    method: "POST",
    body: {
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
  });

  const uploadId = createdUpload?.upload?.uploadId || createdUpload?.upload?.upload_id;
  const objectKey = createdUpload?.upload?.objectKey || createdUpload?.upload?.object_key;
  const chunkSizeBytes =
    createdUpload?.upload?.chunkSizeBytes ||
    createdUpload?.upload?.chunk_size_bytes ||
    DEFAULT_CHUNK_SIZE_BYTES;

  if (!uploadId || !objectKey) {
    throw new Error("La session d'envoi de l'image n'a pas pu etre preparee.");
  }

  try {
    const parts = [];

    for (let offset = 0, partNumber = 1; offset < file.size; offset += chunkSizeBytes, partNumber += 1) {
      const chunk = file.slice(offset, offset + chunkSizeBytes);
      const dataBase64 = await readBlobAsBase64(chunk);
      const response = await apiRequest(
        `/storefront/settings/hero-images/uploads/${encodeURIComponent(uploadId)}/parts`,
        {
          method: "POST",
          body: {
            object_key: objectKey,
            part_number: partNumber,
            data_base64: dataBase64,
          },
        }
      );

      parts.push({
        part_number: response?.part?.partNumber || response?.part?.part_number || partNumber,
        etag: response?.part?.etag,
      });
    }

    const completedUpload = await apiRequest(
      `/storefront/settings/hero-images/uploads/${encodeURIComponent(uploadId)}/complete`,
      {
        method: "POST",
        body: {
          object_key: objectKey,
          parts,
          client_id: photo.id,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      }
    );

    return completedUpload.upload;
  } catch (error) {
    try {
      await apiRequest("/storefront/settings/hero-images/uploads", {
        method: "DELETE",
        body: {
          upload_id: uploadId,
          object_key: objectKey,
        },
      });
    } catch (_cleanupError) {
      // Ignore cleanup failures after a chunk upload error.
    }

    throw error;
  }
};

export const deleteStorefrontTemporaryHeroImage = async (objectKey) => {
  if (!objectKey) {
    return;
  }

  await apiRequest("/storefront/settings/hero-images/uploads", {
    method: "DELETE",
    body: {
      object_key: objectKey,
    },
  });
};
