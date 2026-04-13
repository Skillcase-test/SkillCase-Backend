const { pool } = require("../../util/db");

function normalizeString(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.,!?;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateQuestion(question, userAnswer) {
  const qType = String(question?.type || "").toLowerCase();

  if (qType === "true_false" || qType === "truefalse") {
    return userAnswer === question.correct;
  }

  if (qType === "dialogue_dropdown" || qType === "dialogue_fill_dropdown") {
    if (!userAnswer || typeof userAnswer !== "object") return false;
    return (question.dialogue || []).every((d, idx) => {
      if (Array.isArray(d.options) && d.correct !== undefined) {
        return userAnswer[idx] === d.correct;
      }
      return true;
    });
  }

  if (qType === "mcq_multi") {
    const correctArr = Array.isArray(question.correct) ? question.correct : [];
    const userArr = Array.isArray(userAnswer) ? userAnswer : [];
    return (
      correctArr.length === userArr.length &&
      correctArr.every((value) => userArr.includes(value))
    );
  }

  if (
    qType === "fill_typing" ||
    qType === "fill_blank_typing" ||
    qType === "sentence_correction"
  ) {
    const expected = normalizeString(
      question.correct_sentence || question.correct || question.correct_answer,
    );
    const actual = normalizeString(userAnswer);
    return expected === actual;
  }

  if (qType === "sentence_ordering" || qType === "sentence_reorder") {
    const expectedOrder =
      question.question_data?.correct_order || question.correct_order || [];
    const expected = normalizeString(
      Array.isArray(expectedOrder) ? expectedOrder.join(" ") : expectedOrder,
    );
    const actual = normalizeString(
      Array.isArray(userAnswer) ? userAnswer.join(" ") : userAnswer,
    );
    return expected === actual;
  }

  if (
    qType === "fill_options" ||
    qType === "fill_blank_options" ||
    qType === "listen_select_dropdown"
  ) {
    return userAnswer === question.correct;
  }

  // A1 aliases for single-choice listening interactions
  if (
    qType === "listen_choose_word" ||
    qType === "listen_choose_image" ||
    qType === "dialogue_mcq"
  ) {
    return userAnswer === question.correct;
  }

  // Default single-choice comparison
  if (typeof userAnswer === "number" && Array.isArray(question.options)) {
    return question.options[userAnswer] === question.correct;
  }

  return userAnswer === question.correct;
}

// Get all listening chapters with progress
async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id, c.chapter_name, c.description, c.order_index,
        COUNT(l.id) as content_count,
        COUNT(CASE WHEN p.is_completed THEN 1 END) as completed_count
      FROM a1_chapter c
      LEFT JOIN a1_listening_content l ON l.chapter_id = c.id
      LEFT JOIN a1_listening_progress p ON p.content_id = l.id AND p.user_id = $1
      WHERE c.module = 'listening' AND c.is_active = true
      GROUP BY c.id
      ORDER BY c.order_index ASC
    `,
      [userId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A1 listening chapters:", err);
    return res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

// Get content for chapter
async function getContent(req, res) {
  const { chapterId } = req.params;
  const userId = req.user?.user_id;

  try {
    const contentResult = await pool.query(
      `
      SELECT id, title, content_type, audio_url, transcript, subtitles, questions, order_index
      FROM a1_listening_content
      WHERE chapter_id = $1
      ORDER BY order_index ASC
    `,
      [chapterId],
    );

    const contentIds = contentResult.rows.map((content) => content.id);
    if (contentIds.length === 0) {
      return res.json([]);
    }

    const progressResult = await pool.query(
      `
      SELECT content_id, current_question_index, is_completed, score
      FROM a1_listening_progress
      WHERE user_id = $1 AND content_id = ANY($2::int[])
    `,
      [userId, contentIds],
    );

    const progressMap = {};
    for (const row of progressResult.rows) {
      progressMap[row.content_id] = row;
    }

    const contentWithProgress = contentResult.rows.map((content) => ({
      ...content,
      progress: progressMap[content.id] || {
        current_question_index: 0,
        is_completed: false,
      },
    }));

    return res.json(contentWithProgress);
  } catch (err) {
    console.error("Error fetching A1 listening content:", err);
    return res.status(500).json({ error: "Failed to fetch content" });
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
  INSERT INTO a1_listening_progress (user_id, content_id, current_question_index, is_completed, score, last_practiced)
  VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (user_id, content_id)
  DO UPDATE SET
    current_question_index = GREATEST(a1_listening_progress.current_question_index, EXCLUDED.current_question_index),
    is_completed = a1_listening_progress.is_completed OR EXCLUDED.is_completed,
    score = GREATEST(COALESCE(a1_listening_progress.score, 0), COALESCE(EXCLUDED.score, 0)),
    last_practiced = NOW()
  `,
      [userId, contentId, questionIndex, isCompleted || false, score || null],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving A1 listening progress:", err);
    return res.status(500).json({ error: "Failed to save progress" });
  }
}

// Check answers
async function checkAnswers(req, res) {
  const { contentId, answers } = req.body;

  try {
    const result = await pool.query(
      `SELECT questions FROM a1_listening_content WHERE id = $1`,
      [contentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Content not found" });
    }

    const questions = Array.isArray(result.rows[0].questions)
      ? result.rows[0].questions
      : [];

    let correct = 0;
    const results = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = answers?.[i];
      const isCorrect = evaluateQuestion(question, userAnswer);

      if (isCorrect) correct++;
      results.push({
        questionIndex: i,
        isCorrect,
        correctAnswer: question.correct,
      });
    }

    const total = questions.length;
    const score = total > 0 ? (correct / total) * 100 : 0;

    return res.json({ score, correct, total, results });
  } catch (err) {
    console.error("Error checking A1 listening answers:", err);
    return res.status(500).json({ error: "Failed to check answers" });
  }
}

module.exports = {
  getChapters,
  getContent,
  saveProgress,
  checkAnswers,
};
