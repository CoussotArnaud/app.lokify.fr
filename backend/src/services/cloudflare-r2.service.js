import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import env from "../config/env.js";
import HttpError from "../utils/http-error.js";

const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const buildEncodedObjectKey = (objectKey) =>
  String(objectKey || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const r2ServiceState = {
  override: null,
  client: null,
};

const hasConfiguredValue = (value) => String(value || "").trim().length > 0;

const getR2Config = () => ({
  accountId: env.r2AccountId,
  accessKeyId: env.r2AccessKeyId,
  secretAccessKey: env.r2SecretAccessKey,
  bucket: env.r2Bucket,
  endpoint: env.r2Endpoint,
  publicBaseUrl: normalizeUrl(env.r2PublicBaseUrl),
  region: env.r2Region || "auto",
});

const buildStorageUnavailableError = () =>
  new HttpError(503, "Le service de stockage des images n'est pas configure sur le serveur.", {
    code: "catalog_image_storage_unavailable",
  });

const createR2Client = () => {
  const config = getR2Config();

  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

const getOverride = () => r2ServiceState.override;

const getClient = () => {
  if (r2ServiceState.client) {
    return r2ServiceState.client;
  }

  r2ServiceState.client = createR2Client();
  return r2ServiceState.client;
};

export const hasR2StorageConfig = () => {
  if (getOverride()) {
    return true;
  }

  const config = getR2Config();

  return (
    hasConfiguredValue(config.accountId) &&
    hasConfiguredValue(config.accessKeyId) &&
    hasConfiguredValue(config.secretAccessKey) &&
    hasConfiguredValue(config.bucket) &&
    hasConfiguredValue(config.endpoint) &&
    hasConfiguredValue(config.publicBaseUrl)
  );
};

export const buildR2PublicUrl = (objectKey) => {
  const override = getOverride();
  if (override?.buildPublicUrl) {
    return override.buildPublicUrl(objectKey);
  }

  const config = getR2Config();
  if (!hasConfiguredValue(config.publicBaseUrl)) {
    throw buildStorageUnavailableError();
  }

  const encodedObjectKey = buildEncodedObjectKey(objectKey);
  return `${config.publicBaseUrl}/${encodedObjectKey}`;
};

export const extractR2ObjectKeyFromPublicUrl = (publicUrl) => {
  const override = getOverride();
  if (override?.extractObjectKeyFromPublicUrl) {
    return override.extractObjectKeyFromPublicUrl(publicUrl);
  }

  const config = getR2Config();
  if (!hasConfiguredValue(config.publicBaseUrl)) {
    return null;
  }

  try {
    const baseUrl = new URL(config.publicBaseUrl);
    const candidateUrl = new URL(String(publicUrl || ""));

    if (baseUrl.origin !== candidateUrl.origin) {
      return null;
    }

    const basePath = baseUrl.pathname.replace(/\/+$/, "");
    const candidatePath = candidateUrl.pathname;

    if (basePath) {
      if (candidatePath !== basePath && !candidatePath.startsWith(`${basePath}/`)) {
        return null;
      }
    }

    const objectPath = basePath ? candidatePath.slice(basePath.length) : candidatePath;
    const normalizedObjectPath = objectPath.replace(/^\/+/, "");

    return normalizedObjectPath ? decodeURIComponent(normalizedObjectPath) : null;
  } catch (_error) {
    return null;
  }
};

export const isManagedR2PublicUrl = (publicUrl) => {
  const override = getOverride();
  if (override?.isManagedPublicUrl) {
    return Boolean(override.isManagedPublicUrl(publicUrl));
  }

  return Boolean(extractR2ObjectKeyFromPublicUrl(publicUrl));
};

export const uploadR2Object = async ({
  objectKey,
  body,
  contentType,
  cacheControl,
  metadata,
}) => {
  const override = getOverride();
  if (override?.uploadObject) {
    return override.uploadObject({
      objectKey,
      body,
      contentType,
      cacheControl,
      metadata,
    });
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
    })
  );

  return {
    objectKey,
    publicUrl: buildR2PublicUrl(objectKey),
  };
};

export const deleteR2Object = async (objectKey) => {
  const override = getOverride();
  if (override?.deleteObject) {
    return override.deleteObject(objectKey);
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    })
  );
};

export const setCloudflareR2ServiceOverrideForTests = (override) => {
  r2ServiceState.override = override || null;
  r2ServiceState.client = null;
};

export const resetCloudflareR2ServiceOverrideForTests = () => {
  r2ServiceState.override = null;
  r2ServiceState.client = null;
};
