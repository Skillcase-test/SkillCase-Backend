const { pool } = require("../../util/db");

// Parse ##word(meaning)## format to extract vocabulary
// Note: Using [^#(]+ instead of \w+ to support German chars (ß, ü, ä, ö)
function parseVocabulary(content) {
  const regex = /##([^#(]+)\(([^)]+)\)##/g;
  const vocabulary = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    vocabulary.push({
      word: match[1].trim(),
      meaning: match[2].trim(),
    });
  }

  return vocabulary;
}

// Clean content for display (replace markers with just the word)
function cleanContent(content) {
  return content.replace(/##([^#(]+)\([^)]+\)##/g, "$1");
}

// Get all reading chapters with progress
async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT 
        c.id, c.chapter_name, c.description, c.order_index,
        COUNT(r.id) as content_count,
        COUNT(CASE WHEN p.is_completed THEN 1 END) as completed_count
      FROM a2_chapter c
      LEFT JOIN a2_reading_content r ON r.chapter_id = c.id
      LEFT JOIN a2_reading_progress p ON p.content_id = r.id AND p.user_id = $1
      WHERE c.module = 'reading' AND c.is_active = true
      GROUP BY c.id
      ORDER BY c.order_index ASC
    `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching reading chapters:", err);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

// Get content for chapter
async function getContent(req, res) {
  const { chapterId } = req.params;
  const userId = req.user?.user_id;

  try {
    const contentResult = await pool.query(
      `
      SELECT id, title, content_type, content, hero_image_url, vocabulary, questions, order_index
      FROM a2_reading_content
      WHERE chapter_id = $1
      ORDER BY order_index ASC
    `,
      [chapterId],
    );

    const progressResult = await pool.query(
      `
      SELECT content_id, current_question_index, is_completed, score
      FROM a2_reading_progress
      WHERE user_id = $1 AND content_id = ANY($2::int[])
    `,
      [userId, contentResult.rows.map((c) => c.id)],
    );

    const progressMap = {};
    progressResult.rows.forEach((p) => {
      progressMap[p.content_id] = p;
    });

    // Parse vocabulary from content if not already stored
    const contentWithProgress = contentResult.rows.map((c) => {
      let vocabulary = c.vocabulary;
      if (!vocabulary || vocabulary.length === 0) {
        vocabulary = parseVocabulary(c.content);
      }

      return {
        ...c,
        content: cleanContent(c.content),
        vocabulary,
        progress: progressMap[c.id] || {
          current_question_index: 0,
          is_completed: false,
        },
      };
    });

    res.json(contentWithProgress);
  } catch (err) {
    console.error("Error fetching reading content:", err);
    res.status(500).json({ error: "Failed to fetch content" });
  }
}

// Save progress
async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { contentId, questionIndex, isCompleted, score } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a2_reading_progress (user_id, content_id, current_question_index, is_completed, score, last_practiced)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, content_id)
      DO UPDATE SET current_question_index = $3, is_completed = $4, score = $5, last_practiced = NOW()
    `,
      [userId, contentId, questionIndex, isCompleted || false, score || null],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving reading progress:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
}

// Check answers
async function checkAnswers(req, res) {
  const { contentId, answers } = req.body;

  try {
    const result = await pool.query(
      `
      SELECT questions FROM a2_reading_content WHERE id = $1
    `,
      [contentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Content not found" });
    }

    const questions = result.rows[0].questions;
    let correct = 0;
    const results = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const userAnswer = answers[i];
      let isCorrect = false;

      if (q.type === "true_false" || q.type === "truefalse") {
        isCorrect = userAnswer === q.correct;
      } else if (q.type === "mcq_multi") {
        // Multi-select: arrays must match
        const correctArr = q.correct || [];
        const userArr = Array.isArray(userAnswer) ? userAnswer : [];
        isCorrect = correctArr.length === userArr.length && 
          correctArr.every(c => userArr.includes(c));
      } else if (q.type === "fill_typing" || q.type === "fill_blank_typing") {
        // Text input: case-insensitive, punctuation-stripped comparison
        const stripPunctuation = (str) => str.replace(/[.,!?;:'"()]/g, '').replace(/\s+/g, ' ').trim();
        const correctText = stripPunctuation((q.correct || q.correct_answer || "").toLowerCase());
        const userText = stripPunctuation((userAnswer || "").toLowerCase());
        console.log("[fill_typing] correct:", correctText, "user:", userText);
        isCorrect = userText === correctText;
      } else if (q.type === "fill_options" || q.type === "fill_blank_options") {
        // Select from options: string comparison
        isCorrect = userAnswer === q.correct;
      } else if (q.type === "sentence_correction") {
        // Correct a sentence: case-insensitive, punctuation-stripped comparison
        const stripPunctuation = (str) => str.replace(/[.,!?;:'"()]/g, '').replace(/\s+/g, ' ').trim();
        const correctText = stripPunctuation((q.correct_sentence || q.correct || "").toLowerCase());
        const userText = stripPunctuation((userAnswer || "").toLowerCase());
        console.log("[sentence_correction] correct:", correctText, "user:", userText);
        isCorrect = userText === correctText;
      } else if (q.type === "sentence_ordering" || q.type === "sentence_reorder") {
        // Order words: compare arrays or joined strings
        const correctOrder = q.correct_order || [];
        if (Array.isArray(userAnswer)) {
          isCorrect = userAnswer.join(" ") === correctOrder.join(" ");
        } else {
          isCorrect = (userAnswer || "").toLowerCase().trim() === correctOrder.join(" ").toLowerCase().trim();
        }
      } else {
        // MCQ single - compare option index or text
        if (typeof userAnswer === 'number' && q.options) {
          isCorrect = q.options[userAnswer] === q.correct;
        } else {
          isCorrect = userAnswer === q.correct;
        }
      }

      if (isCorrect) correct++;
      results.push({ questionIndex: i, isCorrect, correctAnswer: q.correct });
    }

    const score = (correct / questions.length) * 100;

    res.json({ score, correct, total: questions.length, results });
  } catch (err) {
    console.error("Error checking reading answers:", err);
    res.status(500).json({ error: "Failed to check answers" });
  }
}

module.exports = {
  getChapters,
  getContent,
  saveProgress,
  checkAnswers,
  parseVocabulary,
  cleanContent,
};
