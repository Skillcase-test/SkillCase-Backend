const { pool } = require("../../util/db");

// Get all grammar topics with progress
async function getTopics(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT 
        c.id as chapter_id, c.chapter_name, c.description, c.order_index,
        t.id as topic_id, t.name, t.description as topic_desc,
        p.current_question_index, p.is_completed, p.score
      FROM a2_chapter c
      LEFT JOIN a2_grammar_topic t ON t.chapter_id = c.id
      LEFT JOIN a2_grammar_progress p ON p.topic_id = t.id AND p.user_id = $1
      WHERE c.module = 'grammar' AND c.is_active = true
      ORDER BY c.order_index ASC, t.order_index ASC
    `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching grammar topics:", err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
}

// Get topic detail with explanation
async function getTopicDetail(req, res) {
  const { topicId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, name, description, explanation
      FROM a2_grammar_topic
      WHERE id = $1
    `,
      [topicId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Topic not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching topic detail:", err);
    res.status(500).json({ error: "Failed to fetch topic" });
  }
}

// Get questions for topic
async function getQuestions(req, res) {
  const { topicId } = req.params;
  const userId = req.user?.user_id;

  try {
    const questionsResult = await pool.query(
      `
      SELECT id, question_type, question_data, order_index
      FROM a2_grammar_question
      WHERE topic_id = $1
      ORDER BY order_index ASC
    `,
      [topicId],
    );

    const progressResult = await pool.query(
      `
      SELECT current_question_index
      FROM a2_grammar_progress
      WHERE topic_id = $1 AND user_id = $2
    `,
      [topicId, userId],
    );

    res.json({
      questions: questionsResult.rows,
      currentIndex: progressResult.rows[0]?.current_question_index || 0,
    });
  } catch (err) {
    console.error("Error fetching grammar questions:", err);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
}

// Save progress
async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { topicId, questionIndex, isCompleted, score } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a2_grammar_progress (user_id, topic_id, current_question_index, is_completed, score, last_practiced)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, topic_id)
      DO UPDATE SET current_question_index = $3, is_completed = $4, score = $5, last_practiced = NOW()
    `,
      [userId, topicId, questionIndex, isCompleted || false, score || null],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving grammar progress:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
}

// Check answer
async function checkAnswer(req, res) {
  const { questionId, answer } = req.body;
  if (!questionId) {
    return res.status(400).json({ error: "questionId is required" });
  }
  try {
    const result = await pool.query(
      `SELECT question_type, question_data FROM a2_grammar_question WHERE id = $1`,
      [questionId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Question not found" });
    }
    const question = result.rows[0];
    // Parse question_data if it's a string
    const data =
      typeof question.question_data === "string"
        ? JSON.parse(question.question_data)
        : question.question_data;

    let isCorrect = false;
    // Null safety checks for all operations
    switch (question.question_type) {
      case "mcq_single":
      case "fill_typing":
      case "fill_options":
        // Null check: both answer and data.correct must exist
        if (answer && data?.correct) {
          isCorrect =
            String(answer).toLowerCase().trim() ===
            String(data.correct).toLowerCase().trim();
        }
        break;
      case "mcq_multi":
        if (Array.isArray(answer) && Array.isArray(data?.correct)) {
          isCorrect =
            JSON.stringify([...answer].sort()) ===
            JSON.stringify([...data.correct].sort());
        }
        break;
      case "true_false":
        isCorrect = answer === data?.correct;
        break;
      case "sentence_ordering":
        if (Array.isArray(answer) && Array.isArray(data?.correct_order)) {
          isCorrect =
            JSON.stringify(answer) === JSON.stringify(data.correct_order);
        }
        break;
      case "sentence_correction":
        if (answer && data?.correct_sentence) {
          // Normalize: lowercase, trim, remove trailing punctuation
          const normalize = (s) =>
            String(s)
              .toLowerCase()
              .trim()
              .replace(/[.!?]+$/, "");
          isCorrect = normalize(answer) === normalize(data.correct_sentence);
        }
        break;
      case "matching":
        if (Array.isArray(answer) && Array.isArray(data?.pairs)) {
          const userSorted = [...answer].sort((a, b) =>
            (a.de || "").localeCompare(b.de || ""),
          );
          const correctSorted = [...data.pairs].sort((a, b) =>
            (a.de || "").localeCompare(b.de || ""),
          );
          isCorrect =
            JSON.stringify(userSorted) === JSON.stringify(correctSorted);
        }
        break;
      default:
        isCorrect = false;
    }
    res.json({
      isCorrect,
      correctAnswer:
        data?.correct ||
        data?.correct_sentence ||
        data?.correct_order ||
        data?.pairs,
    });
  } catch (err) {
    console.error("Error checking answer:", err);
    res.status(500).json({ error: "Failed to check answer" });
  }
}

module.exports = {
  getTopics,
  getTopicDetail,
  getQuestions,
  saveProgress,
  checkAnswer,
};
