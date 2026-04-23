const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  INTERVIEW_S3_BUCKET,
  INTERVIEW_S3_REGION,
  INTERVIEW_S3_ACCESS_KEY_ID,
  INTERVIEW_S3_SECRET_ACCESS_KEY,
  INTERVIEW_S3_PUBLIC_BASE_URL,
  INTERVIEW_UPLOAD_URL_EXPIRY_SECONDS,
  INTERVIEW_DOWNLOAD_URL_EXPIRY_SECONDS,
} = require("./configuration");

const interviewS3Client = new S3Client({
  region: INTERVIEW_S3_REGION,
  credentials: {
    accessKeyId: INTERVIEW_S3_ACCESS_KEY_ID,
    secretAccessKey: INTERVIEW_S3_SECRET_ACCESS_KEY,
  },
});

async function getInterviewUploadUrl({
  key,
  contentType,
  metadata = {},
  expiresIn = INTERVIEW_UPLOAD_URL_EXPIRY_SECONDS,
}) {
  const command = new PutObjectCommand({
    Bucket: INTERVIEW_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    Metadata: metadata,
  });

  const uploadUrl = await getSignedUrl(interviewS3Client, command, {
    expiresIn,
  });

  return {
    uploadUrl,
    key,
    expiresIn,
  };
}

async function getInterviewDownloadUrl(key, options = {}) {
  if (!key) return null;

  const normalizedOptions =
    typeof options === "number"
      ? { expiresIn: options }
      : options && typeof options === "object"
        ? options
        : {};

  const expiresIn =
    Number(normalizedOptions.expiresIn) || INTERVIEW_DOWNLOAD_URL_EXPIRY_SECONDS;
  const fileName = normalizedOptions.fileName
    ? String(normalizedOptions.fileName)
    : null;
  const asAttachment = Boolean(normalizedOptions.asAttachment);

  if (INTERVIEW_S3_PUBLIC_BASE_URL) {
    const normalizedBase = INTERVIEW_S3_PUBLIC_BASE_URL.replace(/\/+$/, "");
    const normalizedKey = String(key).replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedKey}`;
  }

  const commandPayload = {
    Bucket: INTERVIEW_S3_BUCKET,
    Key: key,
  };

  if (asAttachment) {
    const safeFileName = fileName
      ? String(fileName).replace(/[^\w.\-]+/g, "_")
      : "interview-video.webm";
    commandPayload.ResponseContentDisposition = `attachment; filename="${safeFileName}"`;
  }

  const command = new GetObjectCommand(commandPayload);

  return getSignedUrl(interviewS3Client, command, {
    expiresIn,
  });
}

async function listInterviewObjectKeys(prefix) {
  if (!prefix) return [];

  let continuationToken = undefined;
  const keys = [];

  do {
    const command = new ListObjectsV2Command({
      Bucket: INTERVIEW_S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const result = await interviewS3Client.send(command);
    const batchKeys = (result.Contents || [])
      .map((item) => item.Key)
      .filter(Boolean);

    keys.push(...batchKeys);
    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteInterviewObjects(keys = []) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!uniqueKeys.length) return;

  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const chunk = uniqueKeys.slice(index, index + 1000);
    const command = new DeleteObjectsCommand({
      Bucket: INTERVIEW_S3_BUCKET,
      Delete: {
        Objects: chunk.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });

    await interviewS3Client.send(command);
  }
}

async function copyInterviewObject(sourceKey, destinationKey, contentType) {
  if (!sourceKey || !destinationKey || sourceKey === destinationKey) {
    return destinationKey;
  }

  await interviewS3Client.send(
    new CopyObjectCommand({
      Bucket: INTERVIEW_S3_BUCKET,
      CopySource: `${INTERVIEW_S3_BUCKET}/${sourceKey}`,
      Key: destinationKey,
      ContentType: contentType,
      MetadataDirective: contentType ? "REPLACE" : "COPY",
    }),
  );

  return destinationKey;
}

module.exports = {
  interviewS3Client,
  getInterviewUploadUrl,
  getInterviewDownloadUrl,
  listInterviewObjectKeys,
  deleteInterviewObjects,
  copyInterviewObject,
};
