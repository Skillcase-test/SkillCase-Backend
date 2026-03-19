const cron = require("node-cron");
const axios = require("axios");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  TranslateClient,
  TranslateTextCommand,
} = require("@aws-sdk/client-translate");
const cloudinary = require("../config/cloudinary");
const { pool } = require("../util/db");
const {
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
  NEWS_IMAGE_ENABLED,
  NEWS_IMAGE_MODEL_ID,
  NEWS_IMAGE_REGION,
  NEWS_IMAGE_WIDTH,
  NEWS_IMAGE_HEIGHT,
  NEWS_IMAGE_PROMPT_MAX_CHARS,
  NEWS_IMAGE_CLOUDINARY_FOLDER,
} = require("../config/configuration");

const translateClient = new TranslateClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const bedrockClient = new BedrockRuntimeClient({
  region: NEWS_SUMMARY_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const imageBedrockClient = new BedrockRuntimeClient({
  region: NEWS_IMAGE_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const textDecoder = new TextDecoder("utf-8");
let summarizationEnabled = true;
let imageGenerationEnabled = NEWS_IMAGE_ENABLED;
const summaryTargetModelId =
  NEWS_SUMMARY_INFERENCE_PROFILE_ID || NEWS_SUMMARY_MODEL_ID;

const safeText = (value = "") => String(value || "").trim();

const countWords = (text = "") =>
  safeText(text).split(/\s+/).filter(Boolean).length;

const limitWords = (text = "", maxWords = 40) =>
  safeText(text).split(/\s+/).filter(Boolean).slice(0, maxWords).join(" ");

const clampPromptText = (text = "", maxChars = 700) => {
  const cleaned = safeText(text).replace(/\s+/g, " ");
  if (!cleaned || cleaned.length <= maxChars) return cleaned;

  const sliced = cleaned.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  return safeText(lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced);
};

// This sanitization is only for image-generation prompts to reduce model safety blocks.
const sanitizeForImagePrompt = (text = "") => {
  return String(text || "")
    .replace(/\bwar\b/gi, "conflict")
    .replace(/\bwars\b/gi, "conflicts")
    .replace(/\battack(s)?\b/gi, "incident")
    .replace(/\battacked\b/gi, "affected")
    .replace(/\bmissile(s)?\b/gi, "military equipment")
    .replace(/\bdrone(s)?\b/gi, "aircraft")
    .replace(/\bexplosion(s)?\b/gi, "event")
    .replace(/\bbomb(ing|s)?\b/gi, "incident")
    .replace(/\bblast(s)?\b/gi, "event")
    .replace(/\bmilitary base\b/gi, "secured facility")
    .replace(/\barmy\b/gi, "security forces")
    .replace(/\bnavy\b/gi, "maritime forces")
    .replace(/\bairstrike(s)?\b/gi, "aerial activity")
    .replace(/\bweapon(s)?\b/gi, "equipment")
    .replace(/\bkill(ed|ing)?\b/gi, "affected")
    .replace(/\bdeath(s)?\b/gi, "casualties")
    .replace(/\bterror(ist|ism)?\b/gi, "security concern");
};

const toBase64 = (buffer) => Buffer.from(buffer).toString("base64");

const extractGeneratedBase64 = (parsed = {}) => {
  if (Array.isArray(parsed?.images) && parsed.images[0])
    return parsed.images[0];
  if (Array.isArray(parsed?.artifacts) && parsed.artifacts[0]?.base64)
    return parsed.artifacts[0].base64;
  if (Array.isArray(parsed?.output) && parsed.output[0]?.image)
    return parsed.output[0].image;
  if (typeof parsed?.image === "string" && parsed.image.length > 0)
    return parsed.image;
  return "";
};

const shouldDisableImageGeneration = (message = "") =>
  message.includes("AccessDenied") ||
  message.includes("not authorized") ||
  message.includes("bedrock:InvokeModel") ||
  message.includes("ModelError") ||
  message.includes("validation") ||
  message.includes("inference profile") ||
  message.includes("isn't supported") ||
  message.includes("not supported");

const isContentFilterBlocked = (message = "") => {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("blocked by our content filters") ||
    normalized.includes("content filter")
  );
};

const buildImagePrompt = ({ title, summary }) => {
  const maxChars = Math.max(200, NEWS_IMAGE_PROMPT_MAX_CHARS || 700);
  const styleSuffix =
    "Style: professional photorealistic newsroom image, realistic lighting, high quality, factual scene, no text, no logos, no watermark.";

  const promptTitle = sanitizeForImagePrompt(title || "");
  const promptSummary = sanitizeForImagePrompt(summary || "");

  const safeTitle = clampPromptText(promptTitle, 180);
  const remainingForContext = Math.max(
    100,
    maxChars - styleSuffix.length - safeTitle.length - 24,
  );
  const safeSummary = clampPromptText(promptSummary, remainingForContext);

  return clampPromptText(
    `Title: ${safeTitle}. Context: ${safeSummary}. ${styleSuffix}`,
    maxChars,
  );
};

const buildUltraSafeImagePrompt = () => {
  const maxChars = Math.max(200, NEWS_IMAGE_PROMPT_MAX_CHARS || 700);
  return clampPromptText(
    "Professional realistic news editorial photograph of a neutral city scene with people, buildings, and natural daylight. High quality, documentary style, balanced composition, clean details, no violence, no weapons, no conflict visuals, no text, no logos, no watermark.",
    maxChars,
  );
};

const downloadReferenceImage = async (imageUrl) => {
  const safeUrl = safeText(imageUrl);
  if (!safeUrl) return null;

  try {
    const response = await axios.get(safeUrl, {
      responseType: "arraybuffer",
      timeout: 12000,
      maxContentLength: 8 * 1024 * 1024,
    });

    const contentType = String(response?.headers?.["content-type"] || "");
    if (!contentType.startsWith("image/")) return null;

    return Buffer.from(response.data);
  } catch (error) {
    console.warn(
      "[NewsIngest][ImageGen] Reference image fetch failed:",
      error.message,
    );
    return null;
  }
};

const invokeNovaCanvas = async ({ prompt, referenceImageBase64 }) => {
  const baseConfig = {
    numberOfImages: 1,
    width: NEWS_IMAGE_WIDTH,
    height: NEWS_IMAGE_HEIGHT,
    cfgScale: 7,
  };

  const promptCandidates = [prompt, buildUltraSafeImagePrompt()].filter(
    (value, index, arr) => safeText(value) && arr.indexOf(value) === index,
  );

  for (
    let promptIndex = 0;
    promptIndex < promptCandidates.length;
    promptIndex += 1
  ) {
    const candidatePrompt = promptCandidates[promptIndex];

    const guidedPayload = {
      taskType: "IMAGE_VARIATION",
      imageVariationParams: {
        text: candidatePrompt,
        images: referenceImageBase64 ? [referenceImageBase64] : [],
        similarityStrength: 0.75,
      },
      imageGenerationConfig: baseConfig,
    };

    const textOnlyPayload = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: candidatePrompt,
      },
      imageGenerationConfig: baseConfig,
    };

    const payloads = referenceImageBase64
      ? [guidedPayload, textOnlyPayload]
      : [textOnlyPayload];

    for (const payload of payloads) {
      try {
        const command = new InvokeModelCommand({
          modelId: NEWS_IMAGE_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(payload),
        });

        const response = await imageBedrockClient.send(command);
        const bodyString = textDecoder.decode(response.body);
        const parsed = JSON.parse(bodyString || "{}");
        const base64Image = safeText(extractGeneratedBase64(parsed));

        if (base64Image) {
          return {
            buffer: Buffer.from(base64Image, "base64"),
            mode:
              payload.taskType === "IMAGE_VARIATION" ? "guided" : "prompt-only",
          };
        }
      } catch (error) {
        const message = String(error?.message || "");
        const blockedByFilter = isContentFilterBlocked(message);
        const isLastPromptCandidate =
          promptIndex === promptCandidates.length - 1;

        if (blockedByFilter) {
          console.warn(
            `[NewsIngest][ImageGen] ${payload.taskType} blocked by content filter${
              isLastPromptCandidate ? "" : ", retrying with safer prompt"
            }:`,
            message,
          );
          continue;
        }

        if (payload.taskType === "TEXT_IMAGE") {
          throw error;
        }

        console.warn(
          "[NewsIngest][ImageGen] Guided generation failed, falling back:",
          message,
        );
      }
    }
  }

  return null;
};

const uploadGeneratedImageToCloudinary = async (imageBuffer, newsKey) => {
  if (!imageBuffer) return null;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: NEWS_IMAGE_CLOUDINARY_FOLDER,
        resource_type: "image",
        public_id: `news_${safeText(newsKey)
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 120)}`,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          secureUrl: safeText(result?.secure_url),
          publicId: safeText(result?.public_id),
        });
      },
    );

    uploadStream.end(imageBuffer);
  });
};

const generateNewsImage = async ({
  title,
  summary,
  sourceImageUrl,
  newsKey,
}) => {
  if (!imageGenerationEnabled) {
    return {
      imageUrl: "",
      mode: "disabled",
      promptLength: 0,
      publicId: "",
    };
  }

  const prompt = buildImagePrompt({ title, summary });
  const referenceBuffer = await downloadReferenceImage(sourceImageUrl);
  const referenceBase64 = referenceBuffer ? toBase64(referenceBuffer) : "";

  try {
    const generated = await invokeNovaCanvas({
      prompt,
      referenceImageBase64: referenceBase64,
    });

    if (!generated?.buffer) {
      return {
        imageUrl: "",
        mode: "fallback",
        promptLength: prompt.length,
        publicId: "",
      };
    }

    const uploaded = await uploadGeneratedImageToCloudinary(
      generated.buffer,
      newsKey,
    );

    return {
      imageUrl: safeText(uploaded?.secureUrl),
      mode: generated.mode,
      promptLength: prompt.length,
      publicId: safeText(uploaded?.publicId),
    };
  } catch (error) {
    const message = String(error?.message || "");
    if (shouldDisableImageGeneration(message)) {
      imageGenerationEnabled = false;
      console.error(
        "[NewsIngest][ImageGen] Disabled for this run due to config/permission issue:",
        message,
      );
    } else {
      console.error("[NewsIngest][ImageGen] Generation error:", message);
    }

    return {
      imageUrl: "",
      mode: "error",
      promptLength: prompt.length,
      publicId: "",
    };
  }
};

const splitSentences = (text = "") =>
  safeText(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const sentenceAwareLimit = (text = "", maxWords = 40) => {
  const cleaned = safeText(text);
  if (!cleaned) return "";

  const sentences = splitSentences(cleaned);
  if (sentences.length <= 1) {
    // Never cut a single sentence in the middle.
    return cleaned;
  }

  let selected = "";
  let selectedWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    const nextWords = selectedWords + sentenceWords;

    if (!selected) {
      selected = sentence;
      selectedWords = sentenceWords;
      continue;
    }

    if (nextWords > maxWords) break;

    selected = `${selected} ${sentence}`;
    selectedWords = nextWords;
  }

  return safeText(selected || cleaned);
};

const normalizeShortTitle = (candidate, fallback) => {
  const cleanedCandidate = safeText(candidate);
  const cleanedFallback = safeText(fallback);

  if (!cleanedCandidate && !cleanedFallback) return "";

  let selected = cleanedCandidate || cleanedFallback;
  let words = countWords(selected);

  if (words > 6) {
    selected = limitWords(selected, 6);
    words = countWords(selected);
  }

  if (words < 4 && cleanedFallback) {
    selected = limitWords(cleanedFallback, 6);
  }

  return safeText(selected);
};

const normalizeSummary = (candidate, fallback) => {
  const cleanedCandidate = safeText(candidate);
  const cleanedFallback = safeText(fallback);

  if (!cleanedCandidate && !cleanedFallback) return "";

  let selected = cleanedCandidate || cleanedFallback;
  let words = countWords(selected);

  if (words > 40) {
    selected = sentenceAwareLimit(selected, 40);
    words = countWords(selected);
  }

  if (words < 35 && cleanedFallback) {
    const fallbackCandidate = sentenceAwareLimit(cleanedFallback, 40);
    if (countWords(fallbackCandidate) >= words) {
      selected = fallbackCandidate;
    }
  }

  return safeText(selected);
};

const buildNewsKey = (article) => {
  if (article.url) return safeText(article.url);
  const source = safeText(article?.source?.name || "unknown-source");
  const title = safeText(article.title || "untitled");
  const published = safeText(article.publishedAt || "");
  return `${source}|${title}|${published}`;
};

// Uniqueness helpers
const tokenizeTitle = (title = "") =>
  safeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2); // ignore short stop-words

const wordOverlapRatio = (titleA, titleB) => {
  const tokensA = new Set(tokenizeTitle(titleA));
  const tokensB = new Set(tokenizeTitle(titleB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  tokensA.forEach((word) => {
    if (tokensB.has(word)) shared += 1;
  });

  // Jaccard similarity: intersection / union
  const union = tokensA.size + tokensB.size - shared;
  return shared / union;
};

const SIMILARITY_THRESHOLD = 0.55; // 55% word overlap = considered near-duplicate
const RECENCY_DAYS = 7;

const isTitleNearDuplicate = async (candidateTitle) => {
  if (!safeText(candidateTitle)) return false;

  try {
    const result = await pool.query(
      `SELECT english_title
   FROM news_article
   WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
     AND is_active = TRUE`,
      [RECENCY_DAYS],
    );

    for (const row of result.rows) {
      const ratio = wordOverlapRatio(candidateTitle, row.english_title);
      if (ratio >= SIMILARITY_THRESHOLD) {
        console.log(
          `[NewsIngest][Dedup] Skipping near-duplicate: "${candidateTitle}" ~ "${row.english_title}" (ratio: ${ratio.toFixed(2)})`,
        );
        return true;
      }
    }
  } catch (err) {
    // Non-fatal — if the check fails, allow the article through
    console.warn("[NewsIngest][Dedup] Similarity check failed:", err.message);
  }

  return false;
};

const translateToGerman = async (text) => {
  const sourceText = safeText(text);
  if (!sourceText) return "";

  try {
    const command = new TranslateTextCommand({
      Text: sourceText,
      SourceLanguageCode: "en",
      TargetLanguageCode: "de",
    });
    const response = await translateClient.send(command);
    return safeText(response.TranslatedText);
  } catch (error) {
    console.error("[NewsIngest] Translate error:", error.message);
    return "";
  }
};

const summarizeArticleInEnglish = async ({ title, description, content }) => {
  const sourceTitle = safeText(title);
  const fallback = safeText(description || content);
  const rawBody = safeText(
    [sourceTitle, safeText(description), safeText(content)].join("\n\n"),
  );

  if (!rawBody) {
    return {
      shortTitle: normalizeShortTitle(sourceTitle, sourceTitle),
      summary: "",
      detailedSummary: "",
    };
  }

  if (!summarizationEnabled) {
    const normalizedFallback = normalizeSummary(fallback, rawBody);
    return {
      shortTitle: normalizeShortTitle(sourceTitle, sourceTitle),
      summary: normalizedFallback,
      detailedSummary: normalizedFallback,
    };
  }

  const prompt = `You are a professional news summarizer writing for language learners.

Task:
Rewrite this news into beginner-friendly English while preserving factual accuracy.

Rules:

* Create a short title with exactly 4 to 6 words at max.
* Create one summary paragraph with 35 to 40 words.
* Never cut a sentence in the middle. End at a natural sentence boundary.
* Keep language simple for beginners. Prefer common words and short sentences.
* Keep difficult words only when replacing them would change facts or meaning.
* Keep key facts accurate: who, what, where, when, and why (if important).
* Do not add opinions, assumptions, or extra information.
* Output valid JSON only with this exact shape:
  {"shortTitle":"...","summary":"..."}

Article Title: ${sourceTitle}

Article Content:
${rawBody}
`;

  try {
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: NEWS_SUMMARY_MAX_TOKENS,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: summaryTargetModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command);
    const bodyString = textDecoder.decode(response.body);
    const parsed = JSON.parse(bodyString || "{}");
    const modelRawText = safeText(parsed?.content?.[0]?.text || "");

    let modelShortTitle = "";
    let modelSummary = "";

    try {
      const asJson = JSON.parse(modelRawText);
      modelShortTitle = safeText(asJson?.shortTitle);
      modelSummary = safeText(asJson?.summary);
    } catch (_) {
      const jsonMatch = modelRawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          modelShortTitle = safeText(extractedJson?.shortTitle);
          modelSummary = safeText(extractedJson?.summary);
        } catch (_) {
          modelSummary = modelRawText;
        }
      } else {
        modelSummary = modelRawText;
      }
    }

    const normalizedTitle = normalizeShortTitle(modelShortTitle, sourceTitle);
    const normalizedSummary = normalizeSummary(
      modelSummary,
      fallback || rawBody,
    );

    if (!normalizedSummary) {
      const fallbackSummary = normalizeSummary(fallback, rawBody);
      return {
        shortTitle: normalizeShortTitle(sourceTitle, sourceTitle),
        summary: fallbackSummary,
        detailedSummary: fallbackSummary,
      };
    }

    return {
      shortTitle: normalizedTitle,
      summary: normalizedSummary,
      detailedSummary: normalizedSummary,
    };
  } catch (error) {
    const message = String(error?.message || "");
    const shouldDisableSummary =
      message.includes("on-demand throughput isn’t supported") ||
      message.includes("isn't supported") ||
      message.includes("not authorized") ||
      message.includes("AccessDenied") ||
      message.includes("inference profile") ||
      message.includes("bedrock:InvokeModel");

    if (shouldDisableSummary) {
      summarizationEnabled = false;
      console.error(
        "[NewsIngest] Summarize disabled for this run due to Bedrock config/permission issue:",
        message,
      );
    } else {
      console.error("[NewsIngest] Summarize error:", message);
    }

    const fallbackSummary = normalizeSummary(fallback, rawBody);

    return {
      shortTitle: normalizeShortTitle(sourceTitle, sourceTitle),
      summary: fallbackSummary,
      detailedSummary: fallbackSummary,
    };
  }
};

const ingestNews = async () => {
  summarizationEnabled = true;
  imageGenerationEnabled = NEWS_IMAGE_ENABLED;

  if (!NEWS_API_KEY) {
    console.warn("[NewsIngest] NEWS_API_KEY missing. Skipping ingestion.");
    return;
  }

  try {
    const response = await axios.get(`${NEWS_API_BASE_URL}/top-headlines`, {
      params: {
        country: NEWS_API_COUNTRY,
        lang: NEWS_API_LANGUAGE,
        max: NEWS_FETCH_LIMIT,
        apikey: NEWS_API_KEY,
        max: NEWS_FETCH_LIMIT,
        country: NEWS_API_COUNTRY,
        lang: NEWS_API_LANGUAGE,
      },
      timeout: 15000,
    });

    const articles = Array.isArray(response?.data?.articles)
      ? response.data.articles
      : [];

    const imageStats = {
      guided: 0,
      promptOnly: 0,
      fallback: 0,
      disabled: 0,
      error: 0,
    };

    for (const article of articles) {
      const originalEnglishTitle = safeText(article.title);

      if (!originalEnglishTitle) continue;

      // Skip near-duplicate articles before expensive AI processing
      const isDuplicate = await isTitleNearDuplicate(originalEnglishTitle);
      if (isDuplicate) continue;

      const {
        shortTitle,
        summary: englishSummary,
        detailedSummary: englishContent,
      } = await summarizeArticleInEnglish({
        title: article.title,
        description: article.description,
        content: article.content,
      });

      const englishTitle = normalizeShortTitle(
        shortTitle,
        originalEnglishTitle,
      );

      const germanTitle = await translateToGerman(englishTitle);
      const germanSummary = await translateToGerman(englishSummary);
      const germanContent = await translateToGerman(englishContent);

      const newsKey = buildNewsKey(article);
      const sourceName = safeText(article?.source?.name || "Unknown");
      const articleUrl = safeText(article.url);
      const sourceImageUrl = safeText(article.image || article.urlToImage);
      const publishedAt = article.publishedAt || null;

      const generatedImage = await generateNewsImage({
        title: englishTitle,
        summary: englishSummary,
        sourceImageUrl,
        newsKey,
      });

      if (generatedImage.mode === "guided") imageStats.guided += 1;
      else if (generatedImage.mode === "prompt-only")
        imageStats.promptOnly += 1;
      else if (generatedImage.mode === "disabled") imageStats.disabled += 1;
      else if (generatedImage.mode === "error") imageStats.error += 1;
      else imageStats.fallback += 1;

      const imageUrl = safeText(generatedImage.imageUrl || sourceImageUrl);
      const rawPayload = {
        ...(article || {}),
        _generatedImage: {
          mode: generatedImage.mode,
          promptLength: generatedImage.promptLength,
          publicId: generatedImage.publicId,
          sourceImageUsed: Boolean(sourceImageUrl),
        },
      };

      await pool.query(
        `
          INSERT INTO news_article (
            news_key,
            source_name,
            article_url,
            image_url,
            published_at,
            english_title,
            english_summary,
            english_content,
            german_title,
            german_summary,
            german_content,
            target_levels,
            fetched_at,
            translated_at,
            raw_payload_json,
            updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            ARRAY['ALL','A1','A2']::TEXT[],
            NOW(),
            NOW(),
            $12::jsonb,
            NOW()
          )
          ON CONFLICT (news_key)
          DO UPDATE SET
            source_name = EXCLUDED.source_name,
            article_url = EXCLUDED.article_url,
            image_url = EXCLUDED.image_url,
            published_at = EXCLUDED.published_at,
            english_title = EXCLUDED.english_title,
            english_summary = EXCLUDED.english_summary,
            english_content = EXCLUDED.english_content,
            german_title = EXCLUDED.german_title,
            german_summary = EXCLUDED.german_summary,
            german_content = EXCLUDED.german_content,
            target_levels = EXCLUDED.target_levels,
            fetched_at = NOW(),
            translated_at = NOW(),
            raw_payload_json = EXCLUDED.raw_payload_json,
            updated_at = NOW()
        `,
        [
          newsKey,
          sourceName,
          articleUrl,
          imageUrl,
          publishedAt,
          englishTitle,
          englishSummary,
          englishContent,
          germanTitle,
          germanSummary,
          germanContent,
          JSON.stringify(rawPayload),
        ],
      );
    }

    console.log("[NewsIngest][ImageGen] Stats:", imageStats);
    console.log(`[NewsIngest] Upserted ${articles.length} articles.`);
  } catch (error) {
    const status = error?.response?.status;
    const providerMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.response?.data ||
      "";

    console.error(
      `[NewsIngest] Ingest failed${status ? ` (${status})` : ""}:`,
      providerMessage || error.message,
    );
  }
};

function initNewsIngestJob() {
  if (!NEWS_API_KEY) {
    console.error(
      "[NewsIngest] CRITICAL: NEWS_API_KEY is not set. News ingestion will not run.",
    );
  }
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("[NewsIngest] Running daily ingestion at 8:00 AM IST");
      await ingestNews();
    },
    { timezone: "Asia/Kolkata" },
  );

  const runOnStartup =
    String(process.env.NEWS_RUN_ON_STARTUP || "false").toLowerCase() === "true";

  if (runOnStartup && process.env.NODE_ENV !== "production") {
    ingestNews();
  }

  console.log("[NewsIngest] Daily job scheduled at 8:00 AM IST");
}

module.exports = {
  initNewsIngestJob,
  ingestNews,
};
