const crypto = require("crypto");

function generateShortSlug(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";

  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(0, chars.length);
    output += chars[index];
  }

  return output.toLowerCase();
}

function generateSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sanitizeSlug(input) {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function buildInterviewStorageKey({
  kind,
  positionId = "temp",
  questionId = "temp",
  submissionId = "temp",
  ext = "webm",
}) {
  const safeExt = String(ext || "webm")
    .replace(/^\./, "")
    .toLowerCase();

  if (kind === "intro") {
    return `interviews/${positionId}/intro/video.${safeExt}`;
  }

  if (kind === "farewell") {
    return `interviews/${positionId}/farewell/video.${safeExt}`;
  }

  if (kind === "question") {
    return `interviews/${positionId}/questions/${questionId}/video.${safeExt}`;
  }

  if (kind === "answer") {
    return `interview-submissions/${positionId}/${submissionId}/${questionId}/answer.${safeExt}`;
  }

  throw new Error("Unsupported interview storage key kind");
}

function parseFileExtension(fileName = "", mimeType = "") {
  const fromName = String(fileName).split(".").pop();
  if (fromName && fromName !== fileName) {
    return fromName.toLowerCase();
  }

  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";

  return "webm";
}

module.exports = {
  generateShortSlug,
  generateSessionToken,
  sanitizeSlug,
  buildInterviewStorageKey,
  parseFileExtension,
};
