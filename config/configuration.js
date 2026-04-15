const dotenv = require("dotenv");

dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

// AWS Configuration
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const NEWS_API_BASE_URL =
  process.env.NEWS_API_BASE_URL || "https://gnews.io/api/v4";
const NEWS_API_COUNTRY = process.env.NEWS_API_COUNTRY || "in";
const NEWS_API_LANGUAGE = process.env.NEWS_API_LANGUAGE || "en";
const NEWS_FETCH_LIMIT = Number(process.env.NEWS_FETCH_LIMIT || 25);
const NEWS_API_TIMEOUT_MS = Number(process.env.NEWS_API_TIMEOUT_MS || 15000);
const NEWS_API_MAX_RETRIES = Number(process.env.NEWS_API_MAX_RETRIES || 3);
const NEWS_API_RETRY_BASE_DELAY_MS = Number(
  process.env.NEWS_API_RETRY_BASE_DELAY_MS || 2500,
);
const NEWS_SUMMARY_MODEL_ID =
  process.env.NEWS_SUMMARY_MODEL_ID ||
  "anthropic.claude-haiku-4-5-20251001-v1:0";
const NEWS_SUMMARY_INFERENCE_PROFILE_ID =
  process.env.NEWS_SUMMARY_INFERENCE_PROFILE_ID ||
  process.env.NEWS_SUMMARY_INFERENCE_PROFILE_ARN ||
  "";
const NEWS_SUMMARY_REGION = process.env.NEWS_SUMMARY_REGION || AWS_REGION;
const NEWS_SUMMARY_MAX_TOKENS = Number(
  process.env.NEWS_SUMMARY_MAX_TOKENS || 350,
);

const NEWS_RUN_ON_STARTUP =
  String(process.env.NEWS_RUN_ON_STARTUP || "false").toLowerCase() === "true";
const NEWS_IMAGE_ENABLED =
  String(process.env.NEWS_IMAGE_ENABLED || "true").toLowerCase() === "true";
const NEWS_IMAGE_MODEL_ID =
  process.env.NEWS_IMAGE_MODEL_ID || "amazon.nova-canvas-v1:0";
const NEWS_IMAGE_REGION = process.env.NEWS_IMAGE_REGION || AWS_REGION;
const NEWS_IMAGE_WIDTH = Number(process.env.NEWS_IMAGE_WIDTH || 1024);
const NEWS_IMAGE_HEIGHT = Number(process.env.NEWS_IMAGE_HEIGHT || 1024);
const NEWS_IMAGE_PROMPT_MAX_CHARS = Number(
  process.env.NEWS_IMAGE_PROMPT_MAX_CHARS || 700,
);
const NEWS_IMAGE_CLOUDINARY_FOLDER =
  process.env.NEWS_IMAGE_CLOUDINARY_FOLDER || "skillcase/news-generated";

// Interview
const INTERVIEW_S3_BUCKET = process.env.INTERVIEW_S3_BUCKET || "";
const INTERVIEW_S3_REGION =
  process.env.INTERVIEW_S3_REGION || process.env.AWS_REGION || "ap-south-1";
const INTERVIEW_S3_ACCESS_KEY_ID =
  process.env.INTERVIEW_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const INTERVIEW_S3_SECRET_ACCESS_KEY =
  process.env.INTERVIEW_S3_SECRET_ACCESS_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY;
const INTERVIEW_S3_PUBLIC_BASE_URL =
  process.env.INTERVIEW_S3_PUBLIC_BASE_URL || "";
const INTERVIEW_UPLOAD_URL_EXPIRY_SECONDS = Number(
  process.env.INTERVIEW_UPLOAD_URL_EXPIRY_SECONDS || 900,
);
const INTERVIEW_DOWNLOAD_URL_EXPIRY_SECONDS = Number(
  process.env.INTERVIEW_DOWNLOAD_URL_EXPIRY_SECONDS || 604800,
);

const DB_SSL_REJECT_UNAUTHORIZED =
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false").toLowerCase() ===
  "true";
const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 20);
const DB_POOL_MIN = Number(process.env.DB_POOL_MIN || 2);
const DB_IDLE_TIMEOUT_MS = Number(process.env.DB_IDLE_TIMEOUT_MS || 30000);
const DB_CONNECTION_TIMEOUT_MS = Number(
  process.env.DB_CONNECTION_TIMEOUT_MS || 15000,
);
const DB_ALLOW_EXIT_ON_IDLE =
  String(process.env.DB_ALLOW_EXIT_ON_IDLE || "false").toLowerCase() === "true";
const DB_KEEP_ALIVE =
  String(process.env.DB_KEEP_ALIVE || "true").toLowerCase() === "true";
const DB_KEEP_ALIVE_INITIAL_DELAY_MS = Number(
  process.env.DB_KEEP_ALIVE_INITIAL_DELAY_MS || 10000,
);
const DB_MAX_USES = Number(process.env.DB_MAX_USES || 7500);

const RUN_SCHEDULED_JOBS =
  String(process.env.RUN_SCHEDULED_JOBS || "true").toLowerCase() === "true";

const db_config = {
  connection_string: process.env.CON_STRING,
  ssl: {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  },
  pool: {
    max: DB_POOL_MAX,
    min: DB_POOL_MIN,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    allowExitOnIdle: DB_ALLOW_EXIT_ON_IDLE,
    keepAlive: DB_KEEP_ALIVE,
    keepAliveInitialDelayMillis: DB_KEEP_ALIVE_INITIAL_DELAY_MS,
    maxUses: DB_MAX_USES,
  },
};

module.exports = {
  db_config,
  JWT_SECRET_KEY,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  NEWS_API_KEY,
  NEWS_API_BASE_URL,
  NEWS_API_COUNTRY,
  NEWS_API_LANGUAGE,
  NEWS_FETCH_LIMIT,
  NEWS_API_TIMEOUT_MS,
  NEWS_API_MAX_RETRIES,
  NEWS_API_RETRY_BASE_DELAY_MS,
  NEWS_SUMMARY_MODEL_ID,
  NEWS_SUMMARY_INFERENCE_PROFILE_ID,
  NEWS_SUMMARY_REGION,
  NEWS_SUMMARY_MAX_TOKENS,
  NEWS_RUN_ON_STARTUP,
  NEWS_IMAGE_ENABLED,
  NEWS_IMAGE_MODEL_ID,
  NEWS_IMAGE_REGION,
  NEWS_IMAGE_WIDTH,
  NEWS_IMAGE_HEIGHT,
  NEWS_IMAGE_PROMPT_MAX_CHARS,
  NEWS_IMAGE_CLOUDINARY_FOLDER,
  INTERVIEW_S3_BUCKET,
  INTERVIEW_S3_REGION,
  INTERVIEW_S3_ACCESS_KEY_ID,
  INTERVIEW_S3_SECRET_ACCESS_KEY,
  INTERVIEW_S3_PUBLIC_BASE_URL,
  INTERVIEW_UPLOAD_URL_EXPIRY_SECONDS,
  INTERVIEW_DOWNLOAD_URL_EXPIRY_SECONDS,
  RUN_SCHEDULED_JOBS,
};
