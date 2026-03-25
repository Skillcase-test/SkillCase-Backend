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

const db_config = {
  connection_string: process.env.CON_STRING,
  ssl: {
    rejectUnauthorized: false,
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
};
