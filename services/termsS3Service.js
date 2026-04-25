const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  TERMS_S3_BUCKET,
  TERMS_S3_REGION,
  TERMS_S3_ACCESS_KEY_ID,
  TERMS_S3_SECRET_ACCESS_KEY,
  TERMS_S3_PUBLIC_BASE_URL,
  TERMS_UPLOAD_URL_EXPIRY_SECONDS,
  TERMS_DOWNLOAD_URL_EXPIRY_SECONDS,
} = require("../config/configuration");

const termsS3Client = new S3Client({
  region: TERMS_S3_REGION,
  credentials: {
    accessKeyId: TERMS_S3_ACCESS_KEY_ID,
    secretAccessKey: TERMS_S3_SECRET_ACCESS_KEY,
  },
});

function assertTermsBucketConfigured() {
  if (!TERMS_S3_BUCKET) {
    throw new Error("TERMS_S3_BUCKET is not configured");
  }
}

async function uploadTermsBuffer({
  key,
  body,
  contentType,
  contentDisposition = undefined,
  metadata = {},
}) {
  assertTermsBucketConfigured();
  const command = new PutObjectCommand({
    Bucket: TERMS_S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
    Metadata: metadata,
  });
  await termsS3Client.send(command);
  return { key };
}

async function getTermsDownloadUrl(
  key,
  expiresIn = TERMS_DOWNLOAD_URL_EXPIRY_SECONDS,
) {
  if (!key) return null;
  assertTermsBucketConfigured();

  if (TERMS_S3_PUBLIC_BASE_URL) {
    const normalizedBase = TERMS_S3_PUBLIC_BASE_URL.replace(/\/+$/, "");
    const normalizedKey = String(key).replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedKey}`;
  }

  const command = new GetObjectCommand({
    Bucket: TERMS_S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(termsS3Client, command, { expiresIn });
}

async function getTermsObjectBuffer(key) {
  assertTermsBucketConfigured();
  const command = new GetObjectCommand({
    Bucket: TERMS_S3_BUCKET,
    Key: key,
  });
  const response = await termsS3Client.send(command);
  if (!response.Body) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getTermsUploadUrl({
  key,
  contentType,
  metadata = {},
  expiresIn = TERMS_UPLOAD_URL_EXPIRY_SECONDS,
}) {
  assertTermsBucketConfigured();
  const command = new PutObjectCommand({
    Bucket: TERMS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    Metadata: metadata,
  });
  const uploadUrl = await getSignedUrl(termsS3Client, command, {
    expiresIn,
  });
  return { uploadUrl, key, expiresIn };
}

async function deleteTermsObject(key) {
  if (!key) return;
  assertTermsBucketConfigured();
  const command = new DeleteObjectCommand({
    Bucket: TERMS_S3_BUCKET,
    Key: key,
  });
  await termsS3Client.send(command);
}

module.exports = {
  termsS3Client,
  uploadTermsBuffer,
  getTermsDownloadUrl,
  getTermsUploadUrl,
  getTermsObjectBuffer,
  deleteTermsObject,
};
