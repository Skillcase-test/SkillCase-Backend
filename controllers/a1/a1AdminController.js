const { pool } = require("../../util/db");
const cloudinary = require("../../config/cloudinary");
const AdmZip = require("adm-zip");
const path = require("path");

const templates = {
  flashcard: {
    module_number: 1,
    chapter_name: "A1 Alltag Wortschatz",
    description: "Daily-life vocabulary with image front cards",
    cards: [
      {
        word: "der Tisch",
        meaning: "table",
        sample_sentence: "Der Tisch ist sauber.",
        image_name: "tisch.jpg",
      },
    ],
  },
  grammar: {
    chapter_name: "Grammar Topic Name",
    explanation: "Full explanation of grammar rule...",
    questions: [
      {
        type: "mcq_single",
        question: "Question text with ___ blank",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct: "Option A",
      },
      {
        type: "true_false",
        question: "Statement to evaluate",
        correct: true,
      },
      {
        type: "fill_typing",
        question: "The ___ is correct.",
        correct: "answer",
      },
    ],
  },
  listening: {
    chapter_name: "A1 Listening Chapter",
    description: "Beginner listening practice",
    type: "simple_sentence",
    transcript: "Das ist ein Apfel.",
    audio_name: "chapter-audio.mp3",
    questions: [
      {
        type: "listen_choose_word",
        question: "What word did you hear?",
        options: ["Apfel", "Apfeln", "Apfels"],
        correct: "Apfel",
      },
      {
        type: "listen_choose_image",
        question: "Choose the correct image",
        options: [
          { text: "Apple", image_name: "apfel.jpg" },
          { text: "Banana", image_name: "banane.jpg" },
        ],
        correct: "Apple",
      },
    ],
    contents: [
      {
        title: "Dialogue 1",
        content_type: "dialogue",
        audio_name: "dialogue1.mp3",
        transcript: "A: Hallo, wie heißt du? B: Ich heiße Anna.",
        questions: [
          {
            type: "dialogue_fill_dropdown",
            dialogue: [
              {
                speaker: "A",
                text: "Hallo, wie",
                options: ["heißt", "ist"],
                correct: 0,
              },
              { speaker: "A", text: "du?" },
              {
                speaker: "B",
                text: "Ich",
                options: ["heiße", "heißt"],
                correct: 0,
              },
              { speaker: "B", text: "Anna." },
            ],
          },
        ],
      },
    ],
  },
  speaking: {
    chapter_name: "A1 Speaking Chapter",
    description: "Practice short beginner sentences",
    content: [
      { text_de: "Guten Morgen", text_en: "Good morning" },
      { text_de: "Ich heiße Anna", text_en: "My name is Anna" },
    ],
  },
  reading: {
    topic_name: "Reading Topic",
    contents: [
      {
        type: "email",
        title: "Email Subject",
        content:
          "Liebe Anna,\n\nich lade dich zu meiner ##*Die* Geburtstagsparty(birthday party)## ein...",
        questions: [
          {
            type: "true_false",
            question: "Max is inviting Anna to a party.",
            correct: true,
          },
        ],
      },
    ],
  },
  test: {
    chapter_name: "Test Topic",
    prerequisites: ["Grammar Topic 1"],
    levels: [
      {
        level: 1,
        sets: [
          {
            set_number: 1,
            questions: [
              {
                type: "mcq_single",
                question: "Question 1",
                options: ["A", "B", "C", "D"],
                correct: "A",
              },
            ],
          },
        ],
      },
    ],
  },
};

function normalizeFileName(name = "") {
  return path.basename(name).trim().toLowerCase();
}

function extractImagesFromZip(zipFile) {
  const extractedImages = [];
  const skippedEntries = [];

  if (!zipFile?.buffer) {
    return { extractedImages, skippedEntries };
  }

  const zip = new AdmZip(zipFile.buffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (!entry || entry.isDirectory) {
      continue;
    }

    const baseName = path.basename(entry.entryName || "");
    const key = normalizeFileName(baseName);
    const extension = path.extname(key);
    const isImageExt =
      extension === ".jpg" ||
      extension === ".jpeg" ||
      extension === ".png" ||
      extension === ".webp" ||
      extension === ".gif" ||
      extension === ".svg";

    if (!key || !isImageExt || key.startsWith(".")) {
      skippedEntries.push(entry.entryName);
      continue;
    }

    const buffer = entry.getData();
    if (!buffer || buffer.length === 0) {
      skippedEntries.push(entry.entryName);
      continue;
    }

    extractedImages.push({
      originalname: baseName,
      buffer,
      source: "zip",
    });
  }

  return { extractedImages, skippedEntries };
}

async function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(options, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      })
      .end(buffer);
  });
}

async function mapQuestionMedia(node, imageByName, audioByName, stats) {
  if (Array.isArray(node)) {
    return Promise.all(
      node.map((item) =>
        mapQuestionMedia(item, imageByName, audioByName, stats),
      ),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const mapped = {};
  for (const [key, value] of Object.entries(node)) {
    mapped[key] = await mapQuestionMedia(
      value,
      imageByName,
      audioByName,
      stats,
    );
  }

  const imageName = String(node.image_name || "").trim();
  if (imageName) {
    const imageKey = normalizeFileName(imageName);
    const resolvedUrl = imageByName.get(imageKey) || null;
    if (resolvedUrl) {
      mapped.image_url = resolvedUrl;
      stats.imagesResolved.push(imageName);
      stats.usedImageNames.add(imageKey);
    } else {
      stats.imagesMissing.push(imageName);
    }
  }

  const audioName = String(node.audio_name || "").trim();
  if (audioName) {
    const audioKey = normalizeFileName(audioName);
    const fileEntry = audioByName.get(audioKey);
    if (fileEntry) {
      // Check if already uploaded natively if we kept a cache
      if (!stats.uploadedAudiosCache) stats.uploadedAudiosCache = new Map();
      let secureUrl = stats.uploadedAudiosCache.get(audioKey);

      if (!secureUrl) {
        const uploaded = await uploadBufferToCloudinary(fileEntry.buffer, {
          resource_type: "video",
          folder: "a1-listening-question-audios",
        });
        secureUrl = uploaded.secure_url;
        stats.uploadedAudiosCache.set(audioKey, secureUrl);
      }
      mapped.audio_url = secureUrl;
      stats.usedAudioNames.add(audioKey);
    }
  }

  return mapped;
}

function parseVocabFromContent(content) {
  const vocabRegex = /##(?:\*([^*]+)\*\s+)?([^#(]+)\(([^)]+)\)##/g;
  const vocabulary = [];
  let match;

  while ((match = vocabRegex.exec(content || "")) !== null) {
    const entry = { word: match[2].trim(), meaning: match[3].trim() };
    if (match[1]) entry.article = match[1].trim();
    vocabulary.push(entry);
  }

  return vocabulary;
}

async function getTemplate(req, res) {
  const { module } = req.params;

  if (!templates[module]) {
    return res.status(404).json({ error: "Template not found" });
  }

  return res.json(templates[module]);
}

async function getChapters(req, res) {
  const { module } = req.params;

  if (
    ![
      "flashcard",
      "grammar",
      "listening",
      "speaking",
      "reading",
      "test",
    ].includes(module)
  ) {
    return res.status(400).json({ error: "Unsupported module" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, chapter_name, description, order_index, is_active, created_at
      FROM a1_chapter
      WHERE module = $1
      ORDER BY order_index ASC
      `,
      [module],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A1 chapters:", err);
    return res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

async function reorderChapters(req, res) {
  const { module } = req.params;
  const { orderedIds } = req.body;

  if (!orderedIds || !Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds array required" });
  }

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query(
        `
        UPDATE a1_chapter
        SET order_index = $1, updated_at = NOW()
        WHERE id = $2 AND module = $3
        `,
        [i, orderedIds[i], module],
      );
    }

    return res.json({ success: true, message: "Order updated successfully" });
  } catch (err) {
    console.error("Error reordering A1 chapters:", err);
    return res.status(500).json({ error: "Failed to reorder chapters" });
  }
}

async function deleteChapter(req, res) {
  const { module, chapterId } = req.params;

  try {
    if (module === "flashcard") {
      const imageResult = await pool.query(
        `SELECT front_image_public_id FROM a1_flashcard WHERE set_id IN (SELECT set_id FROM a1_flashcard_set WHERE chapter_id = $1)`,
        [chapterId],
      );

      for (const row of imageResult.rows) {
        if (!row.front_image_public_id) continue;
        try {
          await cloudinary.uploader.destroy(row.front_image_public_id);
        } catch (cloudErr) {
          console.error(
            "Error deleting flashcard image from Cloudinary:",
            cloudErr,
          );
        }
      }

      await pool.query(
        `DELETE FROM a1_flashcard WHERE set_id IN (SELECT set_id FROM a1_flashcard_set WHERE chapter_id = $1)`,
        [chapterId],
      );
      await pool.query(`DELETE FROM a1_flashcard_set WHERE chapter_id = $1`, [
        chapterId,
      ]);
    } else if (module === "grammar") {
      await pool.query(
        `DELETE FROM a1_grammar_question WHERE topic_id IN (SELECT id FROM a1_grammar_topic WHERE chapter_id = $1)`,
        [chapterId],
      );
      await pool.query(`DELETE FROM a1_grammar_topic WHERE chapter_id = $1`, [
        chapterId,
      ]);
    } else if (module === "listening") {
      const audioResult = await pool.query(
        `SELECT audio_url FROM a1_listening_content WHERE chapter_id = $1`,
        [chapterId],
      );

      for (const row of audioResult.rows) {
        if (row.audio_url && row.audio_url.includes("cloudinary")) {
          try {
            const urlParts = row.audio_url.split("/");
            const filename = urlParts[urlParts.length - 1];
            const publicId = `a1-listening/${filename.split(".")[0]}`;
            await cloudinary.uploader.destroy(publicId, {
              resource_type: "video",
            });
          } catch (cloudErr) {
            console.error("Error deleting listening audio:", cloudErr);
          }
        }
      }

      await pool.query(
        `DELETE FROM a1_listening_content WHERE chapter_id = $1`,
        [chapterId],
      );
    } else if (module === "speaking") {
      await pool.query(
        `DELETE FROM a1_speaking_content WHERE chapter_id = $1`,
        [chapterId],
      );
    } else if (module === "reading") {
      const imageResult = await pool.query(
        `SELECT hero_image_url FROM a1_reading_content WHERE chapter_id = $1`,
        [chapterId],
      );

      for (const row of imageResult.rows) {
        if (row.hero_image_url && row.hero_image_url.includes("cloudinary")) {
          try {
            const urlParts = row.hero_image_url.split("/");
            const filename = urlParts[urlParts.length - 1];
            const publicId = `a1-reading/${filename.split(".")[0]}`;
            await cloudinary.uploader.destroy(publicId);
          } catch (cloudErr) {
            console.error("Error deleting image from Cloudinary:", cloudErr);
          }
        }
      }

      await pool.query(`DELETE FROM a1_reading_content WHERE chapter_id = $1`, [
        chapterId,
      ]);
    } else if (module === "test") {
      await pool.query(
        `DELETE FROM a1_test_set WHERE topic_id IN (SELECT id FROM a1_test_topic WHERE chapter_id = $1)`,
        [chapterId],
      );
      await pool.query(`DELETE FROM a1_test_topic WHERE chapter_id = $1`, [
        chapterId,
      ]);
    } else {
      return res.status(400).json({ error: "Unsupported module" });
    }

    await pool.query(`DELETE FROM a1_chapter WHERE id = $1 AND module = $2`, [
      chapterId,
      module,
    ]);

    return res.json({ success: true, message: "Chapter deleted permanently" });
  } catch (err) {
    console.error("Error deleting A1 chapter:", err);
    return res.status(500).json({ error: "Failed to delete chapter" });
  }
}

async function uploadGrammar(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, explanation, questions } = jsonData;

    const chapterResult = await pool.query(
      `
      INSERT INTO a1_chapter (module, chapter_name, order_index)
      VALUES ('grammar', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'grammar'))
      RETURNING id
      `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    const topicResult = await pool.query(
      `
      INSERT INTO a1_grammar_topic (chapter_id, name, explanation, order_index)
      VALUES ($1, $2, $3, 0)
      RETURNING id
      `,
      [chapterId, chapter_name, explanation],
    );

    const topicId = topicResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await pool.query(
        `
        INSERT INTO a1_grammar_question (topic_id, question_type, question_data, order_index)
        VALUES ($1, $2, $3, $4)
        `,
        [topicId, q.type, JSON.stringify(q), i],
      );
    }

    return res.json({
      success: true,
      chapterId,
      questionsInserted: questions.length,
    });
  } catch (err) {
    console.error("Error uploading A1 grammar:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload grammar: " + err.message });
  }
}

async function uploadFlashcard(req, res) {
  try {
    const fileEntry = req.files?.file?.[0];
    if (!fileEntry) {
      return res
        .status(400)
        .json({ error: "JSON file is required as field 'file'" });
    }

    const jsonData = JSON.parse(fileEntry.buffer.toString());
    const { chapter_name, description, cards } = jsonData;
    const moduleNumberRaw = req.body?.moduleNumber ?? jsonData?.module_number;
    const moduleNumber =
      moduleNumberRaw === undefined ||
      moduleNumberRaw === null ||
      moduleNumberRaw === ""
        ? null
        : Number(moduleNumberRaw);

    if (!chapter_name || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        error: "chapter_name and non-empty cards array are required",
      });
    }

    if (
      moduleNumber !== null &&
      (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 12)
    ) {
      return res.status(400).json({
        error: "moduleNumber must be an integer between 1 and 12",
      });
    }

    const uploadedImages = req.files?.images || [];
    const zipFile = req.files?.imagesZip?.[0];
    const { extractedImages: zipImages, skippedEntries: zipSkippedEntries } =
      zipFile
        ? extractImagesFromZip(zipFile)
        : { extractedImages: [], skippedEntries: [] };

    const imageByName = new Map();
    for (const imageFile of uploadedImages) {
      const key = normalizeFileName(imageFile.originalname || "");
      if (key) {
        imageByName.set(key, { ...imageFile, source: "images" });
      }
    }
    for (const zipImageFile of zipImages) {
      const key = normalizeFileName(zipImageFile.originalname || "");
      if (key && !imageByName.has(key)) {
        imageByName.set(key, zipImageFile);
      }
    }

    const imagesMissing = [];
    const imagesResolved = [];
    const usedUploadNames = new Set();
    const cardsToInsert = [];

    const uploadTasks = cards.map((card, i) => async () => {
      const imageName = (card.image_name || "").trim();
      const imageNameKey = normalizeFileName(imageName);

      let frontImageUrl = card.front_image_url || null;
      let frontImagePublicId = null;
      let isResolved = false;
      let isMissing = false;

      if (imageName) {
        const matchingFile = imageByName.get(imageNameKey);
        if (matchingFile) {
          usedUploadNames.add(imageNameKey);
          try {
            // wrap Cloudinary upload in promise
            const uploaded = await new Promise((resolve, reject) => {
              cloudinary.uploader
                .upload_stream({ folder: "a1-flashcard" }, (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                })
                .end(matchingFile.buffer);
            });
            frontImageUrl = uploaded.secure_url;
            frontImagePublicId = uploaded.public_id;
            isResolved = true;
          } catch (err) {
            console.error("Cloudinary upload failed for", imageNameKey, err);
            isMissing = true;
            frontImageUrl = null;
          }
        } else {
          isMissing = true;
          frontImageUrl = null;
        }
      }

      return {
        word_de: card.word || card.front_de || "",
        meaning_en: card.meaning || card.front_meaning || "",
        sample_sentence_de: card.sample_sentence || card.back_de || "",
        front_image_url: frontImageUrl,
        front_image_public_id: frontImagePublicId,
        image_name: imageName || null,
        card_index: i,
        _meta: { imageName, isResolved, isMissing },
      };
    });

    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < uploadTasks.length; i += CONCURRENCY_LIMIT) {
      const chunk = uploadTasks.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(chunk.map((fn) => fn()));
      for (const res of results) {
        if (res._meta.isResolved) imagesResolved.push(res._meta.imageName);
        if (res._meta.isMissing) imagesMissing.push(res._meta.imageName);
        delete res._meta;
        cardsToInsert.push(res);
      }
    }

    const client = await pool.connect();
    let chapterId;
    let setId;
    try {
      await client.query("BEGIN");

      if (moduleNumber !== null) {
        const targetOrderIndex = moduleNumber - 1;
        const existingChapter = await client.query(
          `
          SELECT id
          FROM a1_chapter
          WHERE module = 'flashcard' AND order_index = $1
          LIMIT 1
          `,
          [targetOrderIndex],
        );

        if (existingChapter.rows.length > 0) {
          chapterId = existingChapter.rows[0].id;
          await client.query(
            `
            UPDATE a1_chapter
            SET chapter_name = $1,
                description = $2,
                is_active = true,
                updated_at = NOW()
            WHERE id = $3
            `,
            [chapter_name, description || "", chapterId],
          );

          await client.query(
            `DELETE FROM a1_flashcard_set WHERE chapter_id = $1`,
            [chapterId],
          );
        } else {
          const chapterResult = await client.query(
            `
            INSERT INTO a1_chapter (module, chapter_name, description, order_index)
            VALUES ('flashcard', $1, $2, $3)
            RETURNING id
            `,
            [chapter_name, description || "", targetOrderIndex],
          );
          chapterId = chapterResult.rows[0].id;
        }
      } else {
        const chapterResult = await client.query(
          `
          INSERT INTO a1_chapter (module, chapter_name, description, order_index)
          VALUES ('flashcard', $1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'flashcard'))
          RETURNING id
          `,
          [chapter_name, description || ""],
        );
        chapterId = chapterResult.rows[0].id;
      }

      const setResult = await client.query(
        `
        INSERT INTO a1_flashcard_set (chapter_id, set_name, number_of_cards)
        VALUES ($1, $2, $3)
        RETURNING set_id
        `,
        [chapterId, chapter_name, cardsToInsert.length],
      );
      setId = setResult.rows[0].set_id;

      for (const card of cardsToInsert) {
        await client.query(
          `
          INSERT INTO a1_flashcard (set_id, word_de, meaning_en, sample_sentence_de, front_image_url, front_image_public_id, image_name, card_index)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            setId,
            card.word_de,
            card.meaning_en,
            card.sample_sentence_de,
            card.front_image_url,
            card.front_image_public_id,
            card.image_name,
            card.card_index,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (dbErr) {
      await client.query("ROLLBACK");
      throw dbErr;
    } finally {
      client.release();
    }

    const unreferencedUploads = uploadedImages
      .map((f) => f.originalname)
      .filter((name) => !usedUploadNames.has(normalizeFileName(name || "")));

    const unreferencedZipImages = zipImages
      .map((f) => f.originalname)
      .filter((name) => !usedUploadNames.has(normalizeFileName(name || "")));

    return res.json({
      success: true,
      chapterId,
      setId,
      moduleNumber,
      cardsInserted: cards.length,
      imagesResolved: imagesResolved.length,
      imagesMissing: Array.from(new Set(imagesMissing)),
      unreferencedUploads,
      unreferencedZipImages,
      zipImagesProcessed: zipImages.length,
      zipSkippedEntries,
    });
  } catch (err) {
    console.error("Error uploading A1 flashcard:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload flashcard: " + err.message });
  }
}

async function uploadReading(req, res) {
  try {
    const jsonData = JSON.parse(req.files.file[0].buffer.toString());
    const isNested = Array.isArray(jsonData.contents);
    const topicName = jsonData.topic_name || jsonData.chapter_name;

    if (!topicName) {
      return res.status(400).json({ error: "topic_name is required" });
    }

    let uploadedImageUrl = null;
    if (req.files.image && req.files.image[0]) {
      const imageResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: "a1-reading" }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(req.files.image[0].buffer);
      });
      uploadedImageUrl = imageResult.secure_url;
    }

    if (isNested && uploadedImageUrl) {
      const storyItem = jsonData.contents.find(
        (c) => c.type === "story" && !c.hero_image_url,
      );
      if (storyItem) {
        storyItem.hero_image_url = uploadedImageUrl;
      }
    }

    const chapterResult = await pool.query(
      `
      INSERT INTO a1_chapter (module, chapter_name, order_index)
      VALUES ('reading', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'reading'))
      RETURNING id
      `,
      [topicName],
    );

    const chapterId = chapterResult.rows[0].id;

    const contentItems = isNested
      ? jsonData.contents
      : [
          {
            type: jsonData.type,
            title: jsonData.title || topicName,
            content: jsonData.content,
            context: jsonData.context,
            questions: jsonData.questions,
            hero_image_url: uploadedImageUrl ?? jsonData.hero_image_url ?? null,
          },
        ];

    let totalVocab = 0;

    for (let i = 0; i < contentItems.length; i++) {
      const item = contentItems[i];
      const vocabulary = parseVocabFromContent(item.content || "");
      totalVocab += vocabulary.length;

      await pool.query(
        `
        INSERT INTO a1_reading_content (chapter_id, title, content_type, content, context, hero_image_url, vocabulary, questions, order_index)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          chapterId,
          item.title || topicName,
          item.type || "article",
          item.content || "",
          item.context || null,
          item.hero_image_url || null,
          JSON.stringify(vocabulary),
          JSON.stringify(item.questions || []),
          i,
        ],
      );
    }

    return res.json({
      success: true,
      chapterId,
      contentItemsInserted: contentItems.length,
      vocabularyFound: totalVocab,
    });
  } catch (err) {
    console.error("Error uploading A1 reading:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload reading: " + err.message });
  }
}

async function uploadListening(req, res) {
  try {
    const fileEntry = req.files?.file?.[0];
    if (!fileEntry) {
      return res
        .status(400)
        .json({ error: "JSON file is required as field 'file'" });
    }

    const jsonData = JSON.parse(fileEntry.buffer.toString());
    const chapterName = jsonData.chapter_name;

    if (!chapterName) {
      return res.status(400).json({ error: "chapter_name is required" });
    }

    const chapterAudioFiles = req.files?.audio || [];
    const itemAudioFiles = req.files?.itemAudios || [];
    const imageFiles = req.files?.images || [];

    const chapterAudioByName = new Map();
    for (const chapterAudioFile of chapterAudioFiles) {
      const key = normalizeFileName(chapterAudioFile.originalname || "");
      if (key) chapterAudioByName.set(key, chapterAudioFile);
    }

    const itemAudioByName = new Map();
    for (const audioFile of itemAudioFiles) {
      const key = normalizeFileName(audioFile.originalname || "");
      if (key) itemAudioByName.set(key, audioFile);
    }

    const uploadedImageUrlsByName = new Map();
    for (const imageFile of imageFiles) {
      const key = normalizeFileName(imageFile.originalname || "");
      if (!key) continue;
      const uploaded = await uploadBufferToCloudinary(imageFile.buffer, {
        folder: "a1-listening-images",
      });
      uploadedImageUrlsByName.set(key, uploaded.secure_url);
    }

    const uploadedChapterAudiosCache = new Map();
    let defaultChapterAudioUrl = jsonData.audio_url || null;
    const defaultChapterAudioKey = normalizeFileName(
      chapterAudioFiles[0]?.originalname || "",
    );

    if (chapterAudioFiles.length > 0) {
      const firstChapterAudio = chapterAudioFiles[0];
      const uploadedChapterAudio = await uploadBufferToCloudinary(
        firstChapterAudio.buffer,
        {
          resource_type: "video",
          folder: "a1-listening",
        },
      );
      defaultChapterAudioUrl = uploadedChapterAudio.secure_url;
      if (defaultChapterAudioKey) {
        uploadedChapterAudiosCache.set(
          defaultChapterAudioKey,
          uploadedChapterAudio.secure_url,
        );
      }
    }

    const contentItems = Array.isArray(jsonData.contents)
      ? jsonData.contents
      : [
          {
            title: jsonData.title || chapterName,
            content_type: jsonData.type || "simple_sentence",
            transcript: jsonData.transcript || "",
            subtitles: jsonData.subtitles || [],
            questions: jsonData.questions || [],
            audio_name: jsonData.audio_name || null,
            audio_url: jsonData.audio_url || null,
          },
        ];

    const chapterResult = await pool.query(
      `
      INSERT INTO a1_chapter (module, chapter_name, description, order_index)
      VALUES ('listening', $1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'listening'))
      RETURNING id
      `,
      [chapterName, jsonData.description || ""],
    );

    const chapterId = chapterResult.rows[0].id;

    const imagesResolved = [];
    const imagesMissing = [];
    const usedImageNames = new Set();
    const usedItemAudioNames = new Set();
    const usedChapterAudioNames = new Set();
    const uploadedContentAudiosCache = new Map();
    const uploadedQuestionAudiosCache = new Map();

    for (let i = 0; i < contentItems.length; i++) {
      const item = contentItems[i] || {};
      const audioName = String(item.audio_name || "").trim();
      const audioNameKey = normalizeFileName(audioName);

      let contentAudioUrl = item.audio_url || null;
      if (audioNameKey && itemAudioByName.has(audioNameKey)) {
        if (!uploadedContentAudiosCache.has(audioNameKey)) {
          const uploaded = await uploadBufferToCloudinary(
            itemAudioByName.get(audioNameKey).buffer,
            {
              resource_type: "video",
              folder: "a1-listening",
            },
          );
          uploadedContentAudiosCache.set(audioNameKey, uploaded.secure_url);
        }
        contentAudioUrl = uploadedContentAudiosCache.get(audioNameKey);
        usedItemAudioNames.add(audioNameKey);
      } else if (audioNameKey && chapterAudioByName.has(audioNameKey)) {
        if (!uploadedChapterAudiosCache.has(audioNameKey)) {
          const uploaded = await uploadBufferToCloudinary(
            chapterAudioByName.get(audioNameKey).buffer,
            {
              resource_type: "video",
              folder: "a1-listening",
            },
          );
          uploadedChapterAudiosCache.set(audioNameKey, uploaded.secure_url);
        }
        contentAudioUrl = uploadedChapterAudiosCache.get(audioNameKey);
        usedChapterAudioNames.add(audioNameKey);
      }

      if (!contentAudioUrl) {
        contentAudioUrl = defaultChapterAudioUrl;
        if (defaultChapterAudioKey) {
          usedChapterAudioNames.add(defaultChapterAudioKey);
        }
      }

      const mediaStats = {
        imagesResolved,
        imagesMissing,
        usedImageNames,
        usedAudioNames: usedItemAudioNames,
        uploadedAudiosCache: uploadedQuestionAudiosCache,
      };

      const mappedQuestions = await mapQuestionMedia(
        item.questions || [],
        uploadedImageUrlsByName,
        itemAudioByName,
        mediaStats,
      );

      await pool.query(
        `
        INSERT INTO a1_listening_content (chapter_id, title, content_type, audio_url, transcript, subtitles, questions, order_index)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          chapterId,
          item.title || `${chapterName} ${i + 1}`,
          item.content_type || item.type || jsonData.type || "simple_sentence",
          contentAudioUrl,
          item.transcript || jsonData.transcript || "",
          JSON.stringify(item.subtitles || jsonData.subtitles || []),
          JSON.stringify(mappedQuestions),
          i,
        ],
      );
    }

    const unreferencedImages = imageFiles
      .map((file) => file.originalname)
      .filter((name) => !usedImageNames.has(normalizeFileName(name || "")));

    const unreferencedItemAudios = itemAudioFiles
      .map((file) => file.originalname)
      .filter((name) => !usedItemAudioNames.has(normalizeFileName(name || "")));

    const unreferencedChapterAudios = chapterAudioFiles
      .map((file) => file.originalname)
      .filter(
        (name) => !usedChapterAudioNames.has(normalizeFileName(name || "")),
      );

    return res.json({
      success: true,
      chapterId,
      contentItemsInserted: contentItems.length,
      chapterAudioUploaded: chapterAudioFiles.length > 0,
      chapterAudiosUploaded: chapterAudioFiles.length,
      itemAudiosUploaded: itemAudioFiles.length,
      imagesUploaded: imageFiles.length,
      imagesResolved: imagesResolved.length,
      imagesMissing: Array.from(new Set(imagesMissing)),
      unreferencedImages,
      unreferencedItemAudios,
      unreferencedChapterAudios,
    });
  } catch (err) {
    console.error("Error uploading A1 listening:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload listening: " + err.message });
  }
}

async function uploadSpeaking(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, description, content } = jsonData;

    if (!chapter_name || !Array.isArray(content) || content.length === 0) {
      return res.status(400).json({
        error: "chapter_name and non-empty content array are required",
      });
    }

    const chapterResult = await pool.query(
      `
      INSERT INTO a1_chapter (module, chapter_name, description, order_index)
      VALUES ('speaking', $1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'speaking'))
      RETURNING id
      `,
      [chapter_name, description || ""],
    );

    const chapterId = chapterResult.rows[0].id;

    for (let i = 0; i < content.length; i++) {
      const item = content[i] || {};
      await pool.query(
        `
        INSERT INTO a1_speaking_content (chapter_id, text_de, text_en, audio_url, content_index)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          chapterId,
          item.text_de || "",
          item.text_en || "",
          item.audio_url || null,
          i,
        ],
      );
    }

    return res.json({
      success: true,
      chapterId,
      contentInserted: content.length,
    });
  } catch (err) {
    console.error("Error uploading A1 speaking:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload speaking: " + err.message });
  }
}

async function uploadTest(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, prerequisites, levels } = jsonData;

    const chapterResult = await pool.query(
      `
      INSERT INTO a1_chapter (module, chapter_name, order_index)
      VALUES ('test', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a1_chapter WHERE module = 'test'))
      RETURNING id
      `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    const topicResult = await pool.query(
      `
      INSERT INTO a1_test_topic (chapter_id, name, prerequisites, order_index)
      VALUES ($1, $2, $3, 0)
      RETURNING id
      `,
      [chapterId, chapter_name, JSON.stringify(prerequisites || [])],
    );

    const topicId = topicResult.rows[0].id;

    let setsInserted = 0;
    for (const levelData of levels) {
      for (const setData of levelData.sets) {
        await pool.query(
          `
          INSERT INTO a1_test_set (topic_id, level, set_number, questions)
          VALUES ($1, $2, $3, $4)
          `,
          [
            topicId,
            levelData.level,
            setData.set_number,
            JSON.stringify(setData.questions),
          ],
        );
        setsInserted++;
      }
    }

    return res.json({
      success: true,
      chapterId,
      levelsInserted: levels.length,
      setsInserted,
    });
  } catch (err) {
    console.error("Error uploading A1 test:", err);
    return res
      .status(500)
      .json({ error: "Failed to upload test: " + err.message });
  }
}

module.exports = {
  getTemplate,
  getChapters,
  reorderChapters,
  deleteChapter,
  uploadFlashcard,
  uploadGrammar,
  uploadListening,
  uploadSpeaking,
  uploadReading,
  uploadTest,
};
