import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
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

const streamToBuffer = async (body) => {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  return new Promise((resolve, reject) => {
    const chunks = [];

    body.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    body.on("end", () => resolve(Buffer.concat(chunks)));
    body.on("error", reject);
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

export const headR2Object = async (objectKey) => {
  const override = getOverride();
  if (override?.headObject) {
    return override.headObject(objectKey);
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  const response = await getClient().send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    })
  );

  return {
    contentLength: Number(response.ContentLength || 0),
    contentType: String(response.ContentType || "").trim().toLowerCase(),
    metadata: response.Metadata || {},
  };
};

export const downloadR2Object = async (objectKey) => {
  const override = getOverride();
  if (override?.downloadObject) {
    return override.downloadObject(objectKey);
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    })
  );

  return {
    body: await streamToBuffer(response.Body),
    contentType: String(response.ContentType || "").trim().toLowerCase(),
    metadata: response.Metadata || {},
  };
};

export const createR2MultipartUpload = async ({
  objectKey,
  contentType,
  cacheControl,
  metadata,
}) => {
  const override = getOverride();
  if (override?.createMultipartUpload) {
    return override.createMultipartUpload({
      objectKey,
      contentType,
      cacheControl,
      metadata,
    });
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  const response = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
    })
  );

  return {
    objectKey,
    uploadId: response.UploadId,
  };
};

export const uploadR2MultipartPart = async ({
  objectKey,
  uploadId,
  partNumber,
  body,
}) => {
  const override = getOverride();
  if (override?.uploadMultipartPart) {
    return override.uploadMultipartPart({
      objectKey,
      uploadId,
      partNumber,
      body,
    });
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  const response = await getClient().send(
    new UploadPartCommand({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    })
  );

  return {
    etag: response.ETag,
    partNumber,
  };
};

export const completeR2MultipartUpload = async ({
  objectKey,
  uploadId,
  parts,
}) => {
  const override = getOverride();
  if (override?.completeMultipartUpload) {
    return override.completeMultipartUpload({
      objectKey,
      uploadId,
      parts,
    });
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: (Array.isArray(parts) ? parts : []).map((part) => ({
          ETag: part.etag,
          PartNumber: Number(part.partNumber ?? part.part_number),
        })),
      },
    })
  );

  return {
    objectKey,
    publicUrl: buildR2PublicUrl(objectKey),
  };
};

export const abortR2MultipartUpload = async ({ objectKey, uploadId }) => {
  const override = getOverride();
  if (override?.abortMultipartUpload) {
    return override.abortMultipartUpload({ objectKey, uploadId });
  }

  const config = getR2Config();
  if (!hasR2StorageConfig()) {
    throw buildStorageUnavailableError();
  }

  await getClient().send(
    new AbortMultipartUploadCommand({
      Bucket: config.bucket,
      Key: objectKey,
      UploadId: uploadId,
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
