const { pool } = require("../../util/db");

// Supports: ##word(meaning)## and ##*Article* word(meaning)##
function parseVocabulary(content) {
  const regex = /##(?:\*([^*]+)\*\s+)?([^#(]+)\(([^)]+)\)##/g;
  const vocabulary = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const entry = {
      word: match[2].trim(),
      meaning: match[3].trim(),
    };
    if (match[1]) {
      entry.article = match[1].trim();
    }
    vocabulary.push(entry);
  }

  return vocabulary;
}

function cleanContent(content) {
  return content.replace(/##(?:\*[^*]+\*\s+)?([^#(]+)\([^)]+\)##/g, "$1");
}

async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id, c.chapter_name, c.description, c.order_index,
        COUNT(r.id) as content_count,
        COUNT(CASE WHEN p.is_completed THEN 1 END) as completed_count
      FROM a1_chapter c
      LEFT JOIN a1_reading_content r ON r.chapter_id = c.id
      LEFT JOIN a1_reading_progress p ON p.content_id = r.id AND p.user_id = $1
      WHERE c.module = 'reading' AND c.is_active = true
      GROUP BY c.id
      ORDER BY c.order_index ASC
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A1 reading chapters:", err);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

async function getContent(req, res) {
  const { chapterId } = req.params;
  const userId = req.user?.user_id;

  try {
    const contentResult = await pool.query(
      `
      SELECT id, title, content_type, content, context, hero_image_url, vocabulary, questions, order_index
      FROM a1_reading_content
      WHERE chapter_id = $1
      ORDER BY order_index ASC
      `,
      [chapterId],
    );

    const contentIds = contentResult.rows.map((row) => row.id);
    let progressMap = {};

    if (contentIds.length > 0) {
      const progressResult = await pool.query(
        `
        SELECT content_id, current_question_index, is_completed, score
        FROM a1_reading_progress
        WHERE user_id = $1 AND content_id = ANY($2::int[])
        `,
        [userId, contentIds],
      );

      progressResult.rows.forEach((p) => {
        progressMap[p.content_id] = p;
      });
    }

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
    console.error("Error fetching A1 reading content:", err);
    res.status(500).json({ error: "Failed to fetch content" });
  }
}

async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { contentId, questionIndex, isCompleted, score } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a1_reading_progress (user_id, content_id, current_question_index, is_completed, score, last_practiced)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, content_id)
      DO UPDATE SET
        current_question_index = EXCLUDED.current_question_index,
        is_completed = EXCLUDED.is_completed,
        score = EXCLUDED.score,
        last_practiced = NOW()
      `,
      [userId, contentId, questionIndex, isCompleted || false, score || null],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving A1 reading progress:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
}

async function checkAnswers(req, res) {
  const { contentId, answers } = req.body;

  try {
    const result = await pool.query(
      `SELECT questions FROM a1_reading_content WHERE id = $1`,
      [contentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Content not found" });
    }

    const questions = result.rows[0].questions;

    if (!questions || questions.length === 0) {
      return res.json({ score: 0, correct: 0, total: 0, results: [] });
    }

    let correct = 0;
    const results = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const userAnswer = answers[i];
      let isCorrect = false;

      if (q.type === "true_false" || q.type === "truefalse") {
        isCorrect = userAnswer === q.correct;
      } else if (q.type === "mcq_multi") {
        const correctArr = q.correct || [];
        const userArr = Array.isArray(userAnswer) ? userAnswer : [];
        isCorrect =
          correctArr.length === userArr.length &&
          correctArr.every((c) => userArr.includes(c));
      } else if (q.type === "fill_typing" || q.type === "fill_blank_typing") {
        const stripPunctuation = (str) =>
          str
            .replace(/[.,!?;:'"()]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        const correctText = stripPunctuation(
          (q.correct || q.correct_answer || "").toLowerCase(),
        );
        const userText = stripPunctuation((userAnswer || "").toLowerCase());
        isCorrect = userText === correctText;
      } else if (q.type === "fill_options" || q.type === "fill_blank_options") {
        isCorrect = userAnswer === q.correct;
      } else if (q.type === "sentence_correction") {
        const stripPunctuation = (str) =>
          str
            .replace(/[.,!?;:'"()]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        const correctText = stripPunctuation(
          (q.correct_sentence || q.correct || "").toLowerCase(),
        );
        const userText = stripPunctuation((userAnswer || "").toLowerCase());
        isCorrect = userText === correctText;
      } else if (
        q.type === "sentence_ordering" ||
        q.type === "sentence_reorder"
      ) {
        const correctOrder = q.correct_order || [];
        if (Array.isArray(userAnswer)) {
          isCorrect = userAnswer.join(" ") === correctOrder.join(" ");
        } else {
          isCorrect =
            (userAnswer || "").toLowerCase().trim() ===
            correctOrder.join(" ").toLowerCase().trim();
        }
      } else {
        if (typeof userAnswer === "number" && q.options) {
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
    console.error("Error checking A1 reading answers:", err);
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
