const { pool } = require("../../util/db");
const cloudinary = require("../../config/cloudinary");

// JSON Templates for each module
const templates = {
  flashcard: {
    chapter_name: "Example Chapter",
    description: "Chapter description",
    cards: [
      {
        front_de: "German word",
        front_meaning: "English meaning",
        back_de: "German sentence using the word",
        back_en: "English translation of sentence",
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
      {
        type: "sentence_ordering",
        words: ["ich", "gehe", "heute", "ins", "Kino"],
        correct_order: ["ich", "gehe", "heute", "ins", "Kino"],
        hint_en: "I am going to the cinema today",
      },
      {
        type: "sentence_correction",
        incorrect_sentence: "Ich gehe gestern ins Kino.",
        correct_sentence: "Ich ging gestern ins Kino.",
        hint_en: "I went to the cinema yesterday",
      },
      {
        type: "matching",
        pairs: [
          { de: "Hund", en: "dog" },
          { de: "Katze", en: "cat" },
        ],
      },
    ],
  },

  listening: {
    chapter_name: "Listening Chapter",
    type: "dialogue",
    audio_url: "WILL_BE_UPLOADED",
    transcript: "Optional full transcript",
    questions: [
      {
        type: "mcq_single",
        question: "What did the speaker say?",
        options: ["Option A", "Option B", "Option C"],
        correct: "Option A",
      },
      {
        type: "true_false",
        question: "The speaker ordered pizza.",
        correct: true,
      },
      {
        type: "dialogue_dropdown",
        dialogue: [
          { speaker: "A", text: "Guten Tag!" },
          {
            speaker: "B",
            text: null,
            options: ["Hallo!", "Tschüss!", "Nein!"],
            correct: 0,
          },
        ],
      },
    ],
  },

  speaking: {
    chapter_name: "Speaking Chapter",
    description: "Learn to speak about greetings",
    content: [
      { text_de: "Guten Morgen", text_en: "Good morning" },
      { text_de: "Wie geht es Ihnen?", text_en: "How are you?" },
    ],
  },

  reading: {
    chapter_name: "Reading Chapter",
    type: "email",
    title: "Email Subject",
    content:
      "Liebe Anna,\n\nich lade dich zu meiner ##Geburtstagsparty(birthday party)## ein...\n\nMit freundlichen Grüßen,\nMax",
    questions: [
      {
        type: "true_false",
        question: "Max is inviting Anna to a party.",
        correct: true,
      },
      {
        type: "mcq_single",
        question: "What kind of party is it?",
        options: ["Birthday party", "Wedding", "Graduation"],
        correct: "Birthday party",
      },
    ],
  },

  test: {
    chapter_name: "Test Topic",
    prerequisites: ["Flashcard Chapter 1", "Grammar Topic 1"],
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
          {
            set_number: 2,
            questions: [],
          },
          {
            set_number: 3,
            questions: [],
          },
        ],
      },
    ],
  },
};

// Get template
async function getTemplate(req, res) {
  const { module } = req.params;

  if (!templates[module]) {
    return res.status(404).json({ error: "Template not found" });
  }

  res.json(templates[module]);
}

// Get chapters for a module
async function getChapters(req, res) {
  const { module } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, chapter_name, description, order_index, is_active, created_at
      FROM a2_chapter
      WHERE module = $1
      ORDER BY order_index ASC
    `,
      [module],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching chapters:", err);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

// Reorder chapters
async function reorderChapters(req, res) {
  const { module } = req.params;
  const { orderedIds } = req.body;

  if (!orderedIds || !Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds array required" });
  }

  try {
    // Update order_index for each chapter
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query(
        `
        UPDATE a2_chapter
        SET order_index = $1, updated_at = NOW()
        WHERE id = $2 AND module = $3
      `,
        [i, orderedIds[i], module],
      );
    }

    res.json({ success: true, message: "Order updated successfully" });
  } catch (err) {
    console.error("Error reordering chapters:", err);
    res.status(500).json({ error: "Failed to reorder chapters" });
  }
}

// Delete chapter (hard delete with cascade + Cloudinary cleanup for listening)
async function deleteChapter(req, res) {
  const { module, chapterId } = req.params;

  try {
    // For listening module, delete audio from Cloudinary first
    if (module === "listening") {
      const audioResult = await pool.query(
        `SELECT audio_url FROM a2_listening_content WHERE chapter_id = $1`,
        [chapterId]
      );
      
      for (const row of audioResult.rows) {
        if (row.audio_url && row.audio_url.includes("cloudinary")) {
          try {
            // Extract public_id from Cloudinary URL
            const urlParts = row.audio_url.split("/");
            const filename = urlParts[urlParts.length - 1];
            const publicId = `a2-listening/${filename.split(".")[0]}`;
            await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
          } catch (cloudErr) {
            console.error("Error deleting from Cloudinary:", cloudErr);
          }
        }
      }
      
      // Delete listening content
      await pool.query(`DELETE FROM a2_listening_content WHERE chapter_id = $1`, [chapterId]);
    }

    // Delete related data based on module
    if (module === "flashcard") {
      // Delete flashcards first, then sets
      await pool.query(
        `DELETE FROM a2_flashcard WHERE set_id IN (SELECT set_id FROM a2_flashcard_set WHERE chapter_id = $1)`,
        [chapterId]
      );
      await pool.query(`DELETE FROM a2_flashcard_set WHERE chapter_id = $1`, [chapterId]);
    } else if (module === "grammar") {
      await pool.query(
        `DELETE FROM a2_grammar_question WHERE topic_id IN (SELECT id FROM a2_grammar_topic WHERE chapter_id = $1)`,
        [chapterId]
      );
      await pool.query(`DELETE FROM a2_grammar_topic WHERE chapter_id = $1`, [chapterId]);
    } else if (module === "speaking") {
      await pool.query(`DELETE FROM a2_speaking_content WHERE chapter_id = $1`, [chapterId]);
    } else if (module === "reading") {
      await pool.query(`DELETE FROM a2_reading_content WHERE chapter_id = $1`, [chapterId]);
    } else if (module === "test") {
      await pool.query(
        `DELETE FROM a2_test_set WHERE topic_id IN (SELECT id FROM a2_test_topic WHERE chapter_id = $1)`,
        [chapterId]
      );
      await pool.query(`DELETE FROM a2_test_topic WHERE chapter_id = $1`, [chapterId]);
    }

    // Finally delete the chapter itself
    await pool.query(`DELETE FROM a2_chapter WHERE id = $1 AND module = $2`, [chapterId, module]);

    res.json({ success: true, message: "Chapter deleted permanently" });
  } catch (err) {
    console.error("Error deleting chapter:", err);
    res.status(500).json({ error: "Failed to delete chapter" });
  }
}

// Upload Flashcard
async function uploadFlashcard(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, description, cards } = jsonData;

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, description, order_index)
      VALUES ('flashcard', $1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'flashcard'))
      RETURNING id
    `,
      [chapter_name, description || ""],
    );

    const chapterId = chapterResult.rows[0].id;

    // Create flashcard set
    const setResult = await pool.query(
      `
      INSERT INTO a2_flashcard_set (chapter_id, set_name, number_of_cards)
      VALUES ($1, $2, $3)
      RETURNING set_id
    `,
      [chapterId, chapter_name, cards.length],
    );

    const setId = setResult.rows[0].set_id;

    // Insert cards
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await pool.query(
        `
        INSERT INTO a2_flashcard (set_id, front_de, front_meaning, back_de, back_en, card_index)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          setId,
          card.front_de,
          card.front_meaning,
          card.back_de,
          card.back_en,
          i,
        ],
      );
    }

    res.json({ success: true, chapterId, cardsInserted: cards.length });
  } catch (err) {
    console.error("Error uploading flashcard:", err);
    res
      .status(500)
      .json({ error: "Failed to upload flashcard: " + err.message });
  }
}

// Upload Grammar
async function uploadGrammar(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, explanation, questions } = jsonData;

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, order_index)
      VALUES ('grammar', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'grammar'))
      RETURNING id
    `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    // Create grammar topic
    const topicResult = await pool.query(
      `
      INSERT INTO a2_grammar_topic (chapter_id, name, explanation, order_index)
      VALUES ($1, $2, $3, 0)
      RETURNING id
    `,
      [chapterId, chapter_name, explanation],
    );

    const topicId = topicResult.rows[0].id;

    // Insert questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await pool.query(
        `
        INSERT INTO a2_grammar_question (topic_id, question_type, question_data, order_index)
        VALUES ($1, $2, $3, $4)
      `,
        [topicId, q.type, JSON.stringify(q), i],
      );
    }

    res.json({ success: true, chapterId, questionsInserted: questions.length });
  } catch (err) {
    console.error("Error uploading grammar:", err);
    res.status(500).json({ error: "Failed to upload grammar: " + err.message });
  }
}

// Upload Listening (with audio file)
async function uploadListening(req, res) {
  try {
    const jsonData = JSON.parse(req.files.file[0].buffer.toString());
    const { chapter_name, type, transcript, questions } = jsonData;

    // Upload audio to Cloudinary if provided
    let audioUrl = jsonData.audio_url;
    if (req.files.audio && req.files.audio[0]) {
      const audioResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { resource_type: "video", folder: "a2-listening" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(req.files.audio[0].buffer);
      });
      audioUrl = audioResult.secure_url;
    }

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, order_index)
      VALUES ('listening', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'listening'))
      RETURNING id
    `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    // Create listening content (including subtitles)
    await pool.query(
      `
      INSERT INTO a2_listening_content (chapter_id, title, content_type, audio_url, transcript, subtitles, questions, order_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
    `,
      [
        chapterId,
        chapter_name,
        type,
        audioUrl,
        transcript || "",
        JSON.stringify(jsonData.subtitles || []),
        JSON.stringify(questions),
      ],
    );

    res.json({ success: true, chapterId, audioUrl });
  } catch (err) {
    console.error("Error uploading listening:", err);
    res
      .status(500)
      .json({ error: "Failed to upload listening: " + err.message });
  }
}

// Upload Speaking
async function uploadSpeaking(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, description, content } = jsonData;

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, description, order_index)
      VALUES ('speaking', $1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'speaking'))
      RETURNING id
    `,
      [chapter_name, description || ""],
    );

    const chapterId = chapterResult.rows[0].id;

    // Insert speaking content
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      await pool.query(
        `
        INSERT INTO a2_speaking_content (chapter_id, text_de, text_en, content_index)
        VALUES ($1, $2, $3, $4)
      `,
        [chapterId, c.text_de, c.text_en || "", i],
      );
    }

    res.json({ success: true, chapterId, contentInserted: content.length });
  } catch (err) {
    console.error("Error uploading speaking:", err);
    res
      .status(500)
      .json({ error: "Failed to upload speaking: " + err.message });
  }
}

// Upload Reading (with optional image)
async function uploadReading(req, res) {
  try {
    const jsonData = JSON.parse(req.files.file[0].buffer.toString());
    const { chapter_name, type, title, content, questions } = jsonData;

    // Upload image to Cloudinary if provided (for story type)
    let heroImageUrl = jsonData.hero_image_url;
    if (req.files.image && req.files.image[0]) {
      const imageResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: "a2-reading" }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(req.files.image[0].buffer);
      });
      heroImageUrl = imageResult.secure_url;
    }

    // Parse vocabulary from content
    const vocabulary = [];
    const vocabRegex = /##(\w+)\(([^)]+)\)##/g;
    let match;
    while ((match = vocabRegex.exec(content)) !== null) {
      vocabulary.push({ word: match[1], meaning: match[2] });
    }

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, order_index)
      VALUES ('reading', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'reading'))
      RETURNING id
    `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    // Create reading content
    await pool.query(
      `
      INSERT INTO a2_reading_content (chapter_id, title, content_type, content, hero_image_url, vocabulary, questions, order_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
    `,
      [
        chapterId,
        title || chapter_name,
        type,
        content,
        heroImageUrl || null,
        JSON.stringify(vocabulary),
        JSON.stringify(questions),
      ],
    );

    res.json({ success: true, chapterId, vocabularyFound: vocabulary.length });
  } catch (err) {
    console.error("Error uploading reading:", err);
    res.status(500).json({ error: "Failed to upload reading: " + err.message });
  }
}

// Upload Test
async function uploadTest(req, res) {
  try {
    const jsonData = JSON.parse(req.file.buffer.toString());
    const { chapter_name, prerequisites, levels } = jsonData;

    // Create chapter
    const chapterResult = await pool.query(
      `
      INSERT INTO a2_chapter (module, chapter_name, order_index)
      VALUES ('test', $1, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM a2_chapter WHERE module = 'test'))
      RETURNING id
    `,
      [chapter_name],
    );

    const chapterId = chapterResult.rows[0].id;

    // Create test topic
    const topicResult = await pool.query(
      `
      INSERT INTO a2_test_topic (chapter_id, name, prerequisites, order_index)
      VALUES ($1, $2, $3, 0)
      RETURNING id
    `,
      [chapterId, chapter_name, JSON.stringify(prerequisites || [])],
    );

    const topicId = topicResult.rows[0].id;

    // Insert test sets
    let setsInserted = 0;
    for (const levelData of levels) {
      for (const setData of levelData.sets) {
        await pool.query(
          `
          INSERT INTO a2_test_set (topic_id, level, set_number, questions)
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

    res.json({
      success: true,
      chapterId,
      levelsInserted: levels.length,
      setsInserted,
    });
  } catch (err) {
    console.error("Error uploading test:", err);
    res.status(500).json({ error: "Failed to upload test: " + err.message });
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
