const { pool } = require("../util/db");

const NON_ANSWERABLE_TYPES = new Set([
  "page_break",
  "reading_passage",
  "audio_block",
  "content_block",
]);

function isCompositeItemCorrect(item, itemAnswer, stripPunctuation) {
  const itemType =
    item?.type === "option"
      ? "option"
      : item?.type === "dropdown"
        ? "dropdown"
        : "blank";

  if (itemType === "option" || itemType === "dropdown") {
    const options = Array.isArray(item?.options) ? item.options : [];
    if (typeof item?.correct === "number") {
      return Number(itemAnswer) === item.correct;
    }
    const correctText = String(item?.correct ?? "")
      .trim()
      .toLowerCase();
    if (typeof itemAnswer === "number") {
      return (
        String(options[itemAnswer] ?? "")
          .trim()
          .toLowerCase() === correctText
      );
    }
    return (
      String(itemAnswer ?? "")
        .trim()
        .toLowerCase() === correctText
    );
  }

  const correctBlanks = Array.isArray(item?.correct)
    ? item.correct
    : [item?.correct ?? ""];
  const userBlanks = Array.isArray(itemAnswer)
    ? itemAnswer
    : [itemAnswer ?? ""];

  if (correctBlanks.length !== userBlanks.length) return false;

  return correctBlanks.every((correctValue, blankIdx) => {
    const correctText = stripPunctuation(
      String(correctValue ?? "").toLowerCase(),
    );
    const userText = stripPunctuation(
      String(userBlanks[blankIdx] ?? "").toLowerCase(),
    );
    return userText === correctText;
  });
}

// HELPER: Check time remaining (all in UTC)
function getTimeRemaining(startedAt, durationMinutes) {
  // startedAt is a JS Date from PostgreSQL (already in UTC internally)
  const now = new Date();
  const startTime = new Date(startedAt);
  const elapsedMs = now.getTime() - startTime.getTime();
  const totalMs = durationMinutes * 60 * 1000;
  const remainingMs = totalMs - elapsedMs;
  return {
    remaining_seconds: Math.max(0, Math.floor(remainingMs / 1000)),
    is_expired: remainingMs <= 0,
  };
}

// HELPER: Grade a single answer
function gradeAnswer(question, userAnswer) {
  const qType = question.question_type;
  const qData = question.question_data;

  const stripPunctuation = (str) =>
    str
      .replace(/[.,!?;:'"()]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  switch (qType) {
    case "mcq_single":
    case "mcq": {
      if (typeof userAnswer === "number" && qData.options) {
        return qData.options[userAnswer] === qData.correct;
      }
      return userAnswer === qData.correct;
    }

    case "mcq_multi": {
      const correctArr = qData.correct || [];
      const userArr = Array.isArray(userAnswer) ? userAnswer : [];
      if (correctArr.length !== userArr.length) return false;
      // User sends indices, compare option texts
      const userTexts = userArr
        .map((idx) => qData.options?.[idx])
        .filter(Boolean);
      return correctArr.every((c) => userTexts.includes(c));
    }

    case "true_false":
    case "truefalse": {
      return userAnswer === qData.correct;
    }

    case "fill_typing":
    case "fill_blank_typing": {
      const correctText = stripPunctuation(
        (qData.correct || qData.correct_answer || "").toLowerCase(),
      );
      const userText = stripPunctuation((userAnswer || "").toLowerCase());
      return userText === correctText;
    }

    case "fill_options":
    case "fill_blank_options": {
      return userAnswer === qData.correct;
    }

    case "sentence_ordering":
    case "sentence_reorder": {
      const correctOrder = qData.correct_order || [];
      const userOrder = Array.isArray(userAnswer) ? userAnswer : [];
      return (
        correctOrder.length === userOrder.length &&
        correctOrder.every((word, idx) => userOrder[idx] === word)
      );
    }

    case "sentence_correction": {
      const correctText = stripPunctuation(
        (qData.correct_sentence || qData.correct || "").toLowerCase(),
      );
      const userText = stripPunctuation((userAnswer || "").toLowerCase());
      return userText === correctText;
    }

    case "matching": {
      const correctPairs = qData.correct_pairs || [];
      const userPairs = Array.isArray(userAnswer) ? userAnswer : [];
      if (correctPairs.length !== userPairs.length) return false;
      return correctPairs.every((cp) =>
        userPairs.some((up) => up[0] === cp[0] && up[1] === cp[1]),
      );
    }

    case "dialogue_dropdown": {
      if (!userAnswer || typeof userAnswer !== "object") return false;
      const dialogue = qData.dialogue || [];
      return dialogue.every((d, idx) => {
        if (d.text === null && d.options) {
          return userAnswer[idx] === d.correct;
        }
        return true;
      });
    }

    case "composite_question": {
      const items = Array.isArray(qData.items) ? qData.items : [];
      if (items.length === 0) return false;
      const answers =
        userAnswer && typeof userAnswer === "object" ? userAnswer : {};

      return items.every((item, idx) => {
        const itemAnswer = answers[idx] ?? answers[String(idx)];
        return isCompositeItemCorrect(item, itemAnswer, stripPunctuation);
      });
    }

    default:
      return false;
  }
}

function calculateQuestionScore(question, userAnswer) {
  if (question.question_type !== "composite_question") {
    const isCorrect = gradeAnswer(question, userAnswer);
    return {
      isCorrect,
      scoreRatio: isCorrect ? 1 : 0,
    };
  }

  const qData = question.question_data || {};
  const items = Array.isArray(qData.items) ? qData.items : [];
  if (items.length === 0) {
    return { isCorrect: false, scoreRatio: 0 };
  }

  const stripPunctuation = (str) =>
    str
      .replace(/[.,!?;:'"()]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const answers =
    userAnswer && typeof userAnswer === "object" ? userAnswer : {};
  let correctItems = 0;

  items.forEach((item, idx) => {
    const itemAnswer = answers[idx] ?? answers[String(idx)];
    if (isCompositeItemCorrect(item, itemAnswer, stripPunctuation)) {
      correctItems += 1;
    }
  });

  const scoreRatio = correctItems / items.length;
  return {
    isCorrect: scoreRatio === 1,
    scoreRatio,
  };
}

// GET VISIBLE EXAMS
async function getVisibleExams(req, res) {
  const userId = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT DISTINCT
        ht.test_id, ht.title, ht.description, ht.duration_minutes, 
        ht.is_active, ht.results_visible, ht.created_at,
        ht.available_from, ht.available_until,
        (SELECT COUNT(*) FROM hardcore_test_question WHERE test_id = ht.test_id AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block')) AS total_questions,
        s.submission_id, s.status, s.started_at, s.finished_at, s.score
      FROM hardcore_test ht
      INNER JOIN hardcore_test_visibility htv ON ht.test_id = htv.test_id
      LEFT JOIN user_batch ub ON htv.batch_id = ub.batch_id AND ub.user_id = $1
      LEFT JOIN hardcore_test_submission s ON ht.test_id = s.test_id AND s.user_id = $1
      WHERE ht.is_active = true
        AND (htv.batch_id IS NOT NULL AND ub.user_id IS NOT NULL OR htv.user_id = $1)
      ORDER BY ht.created_at DESC`,
      [userId],
    );
    res.json({ exams: result.rows });
  } catch (err) {
    console.error("Error getting visible exams:", err);
    res.status(500).json({ msg: "Failed to fetch exams" });
  }
}
// GET EXAM INFO (without questions)
async function getExamInfo(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    // Verify visibility
    const visCheck = await pool.query(
      `SELECT 1 FROM hardcore_test_visibility v
       LEFT JOIN user_batch ub ON ub.batch_id = v.batch_id AND ub.user_id = $2
       WHERE v.test_id = $1 AND (v.user_id = $2 OR ub.user_id IS NOT NULL)
       LIMIT 1`,
      [testId, userId],
    );
    if (visCheck.rows.length === 0) {
      return res
        .status(403)
        .json({ msg: "You do not have access to this exam" });
    }

    const examResult = await pool.query(
      `SELECT test_id, title, description, proficiency_level, duration_minutes, total_questions, results_visible
       FROM hardcore_test WHERE test_id = $1 AND is_active = true`,
      [testId],
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }

    // Check existing submission
    const subResult = await pool.query(
      `SELECT * FROM hardcore_test_submission WHERE test_id = $1 AND user_id = $2`,
      [testId, userId],
    );

    const exam = examResult.rows[0];
    const submission = subResult.rows[0] || null;

    // Add remaining time if in progress
    if (
      submission &&
      submission.status === "in_progress" &&
      submission.started_at
    ) {
      const { remaining_seconds, is_expired } = getTimeRemaining(
        submission.started_at,
        exam.duration_minutes,
      );
      submission.remaining_seconds = remaining_seconds;
      submission.is_expired = is_expired;
    }

    res.json({ exam, submission });
  } catch (err) {
    console.error("Error getting exam info:", err);
    res.status(500).json({ msg: "Failed to get exam info" });
  }
}

// START EXAM
async function startExam(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    // Get exam
    const examResult = await pool.query(
      `SELECT * FROM hardcore_test WHERE test_id = $1 AND is_active = true`,
      [testId],
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }

    const exam = examResult.rows[0];

    // Check scheduling window
    const now = new Date();
    if (exam.available_from && now < new Date(exam.available_from)) {
      return res.status(400).json({
        msg: "This exam has not started yet",
        available_from: exam.available_from,
      });
    }

    if (exam.available_until && now > new Date(exam.available_until)) {
      return res.status(400).json({
        msg: "This exam window has closed",
        available_until: exam.available_until,
      });
    }

    // Check/create submission
    let subResult = await pool.query(
      `SELECT * FROM hardcore_test_submission WHERE test_id = $1 AND user_id = $2`,
      [testId, userId],
    );

    let submission;
    if (subResult.rows.length === 0) {
      // First time: create submission with started_at = NOW() (UTC)
      const insertResult = await pool.query(
        `INSERT INTO hardcore_test_submission (test_id, user_id, started_at, status, total_points)
         VALUES ($1, $2, NOW(), 'in_progress', $3)
         RETURNING *`,
        [testId, userId, exam.total_questions],
      );
      submission = insertResult.rows[0];
    } else {
      submission = subResult.rows[0];

      if (submission.status === "completed") {
        return res
          .status(400)
          .json({ msg: "You have already completed this exam" });
      }
      if (submission.status === "warned_out") {
        return res.status(400).json({
          msg: "Your exam was closed due to warnings. Contact admin to reopen.",
        });
      }
      if (submission.status === "auto_closed") {
        return res
          .status(400)
          .json({ msg: "Your exam was auto-closed due to time expiry." });
      }

      // If reopened or continuing, just keep the existing started_at
      // (remaining time = duration - elapsed)
      if (submission.status === "not_started") {
        await pool.query(
          `UPDATE hardcore_test_submission
           SET started_at = NOW(), status = 'in_progress'
           WHERE submission_id = $1`,
          [submission.submission_id],
        );
        submission.started_at = new Date();
        submission.status = "in_progress";
      }
    }

    // Check if time already expired
    const { remaining_seconds, is_expired } = getTimeRemaining(
      submission.started_at,
      exam.duration_minutes,
    );

    if (is_expired) {
      await pool.query(
        `UPDATE hardcore_test_submission
         SET status = 'auto_closed', finished_at = NOW()
         WHERE submission_id = $1`,
        [submission.submission_id],
      );
      return res.status(400).json({ msg: "Exam time has expired" });
    }

    // Get questions (without correct answers)
    const questionsResult = await pool.query(
      `SELECT question_id, question_order, question_type, question_data, audio_url
       FROM hardcore_test_question WHERE test_id = $1 ORDER BY question_order ASC`,
      [testId],
    );

    // Strip correct answers from question_data before sending to student
    const questions = questionsResult.rows.map((q) => {
      const data = { ...q.question_data };
      delete data.correct;
      delete data.correct_answer;
      delete data.correct_sentence;
      delete data.correct_order;
      delete data.correct_pairs;
      // For dialogue_dropdown, strip correct from each dialogue entry
      if (data.dialogue) {
        data.dialogue = data.dialogue.map((d) => {
          const cleaned = { ...d };
          delete cleaned.correct;
          return cleaned;
        });
      }
      if (Array.isArray(data.items)) {
        data.items = data.items.map((item) => {
          const cleaned = { ...item };
          if ((cleaned?.type || "blank") === "blank") {
            const blankCount = Array.isArray(cleaned.correct)
              ? cleaned.correct.length
              : 1;
            cleaned.blank_count = Math.max(1, blankCount);
          }
          delete cleaned.correct;
          return cleaned;
        });
      }
      return { ...q, question_data: data };
    });

    // Get already submitted answers
    const answersResult = await pool.query(
      `SELECT question_id, user_answer FROM hardcore_test_answer WHERE submission_id = $1`,
      [submission.submission_id],
    );
    const savedAnswers = {};
    answersResult.rows.forEach((a) => {
      savedAnswers[a.question_id] = a.user_answer;
    });

    res.json({
      exam: {
        test_id: exam.test_id,
        title: exam.title,
        duration_minutes: exam.duration_minutes,
        total_questions: exam.total_questions,
      },
      submission: {
        submission_id: submission.submission_id,
        status: submission.status,
        warning_count: submission.warning_count,
        remaining_seconds,
      },
      questions,
      savedAnswers,
    });
  } catch (err) {
    console.error("Error starting exam:", err);
    res.status(500).json({ msg: "Failed to start exam" });
  }
}

// GET TIME REMAINING
async function getTimeRemaining_endpoint(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    const subResult = await pool.query(
      `SELECT s.started_at, s.status, t.duration_minutes
       FROM hardcore_test_submission s
       JOIN hardcore_test t ON t.test_id = s.test_id
       WHERE s.test_id = $1 AND s.user_id = $2`,
      [testId, userId],
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ msg: "No active submission found" });
    }

    const sub = subResult.rows[0];
    if (sub.status !== "in_progress") {
      return res.json({
        remaining_seconds: 0,
        is_expired: true,
        status: sub.status,
      });
    }

    const { remaining_seconds, is_expired } = getTimeRemaining(
      sub.started_at,
      sub.duration_minutes,
    );

    if (is_expired) {
      await pool.query(
        `UPDATE hardcore_test_submission
         SET status = 'auto_closed', finished_at = NOW()
         WHERE test_id = $1 AND user_id = $2 AND status = 'in_progress'`,
        [testId, userId],
      );
      return res.json({
        remaining_seconds: 0,
        is_expired: true,
        status: "auto_closed",
      });
    }

    res.json({ remaining_seconds, is_expired: false, status: "in_progress" });
  } catch (err) {
    console.error("Error getting time:", err);
    res.status(500).json({ msg: "Failed to get remaining time" });
  }
}

// SAVE ANSWER (per question)
async function saveAnswer(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;
  const { question_id, answer } = req.body;

  if (!question_id) {
    return res.status(400).json({ msg: "question_id is required" });
  }

  try {
    // Reject saves for non-question types
    const qTypeCheck = await pool.query(
      `SELECT question_type FROM hardcore_test_question WHERE question_id = $1 AND test_id = $2`,
      [question_id, testId],
    );
    if (qTypeCheck.rows.length > 0) {
      const qType = qTypeCheck.rows[0].question_type;
      if (NON_ANSWERABLE_TYPES.has(qType)) {
        return res
          .status(400)
          .json({ msg: "Cannot save answer for this item type" });
      }
    }

    // Get submission
    const subResult = await pool.query(
      `SELECT s.*, t.duration_minutes
       FROM hardcore_test_submission s
       JOIN hardcore_test t ON t.test_id = s.test_id
       WHERE s.test_id = $1 AND s.user_id = $2`,
      [testId, userId],
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ msg: "No active submission" });
    }

    const sub = subResult.rows[0];
    if (sub.status !== "in_progress") {
      return res.status(400).json({ msg: "Exam is not in progress" });
    }

    // Check time
    const { is_expired } = getTimeRemaining(
      sub.started_at,
      sub.duration_minutes,
    );
    if (is_expired) {
      await pool.query(
        `UPDATE hardcore_test_submission
         SET status = 'auto_closed', finished_at = NOW()
         WHERE submission_id = $1`,
        [sub.submission_id],
      );
      return res
        .status(400)
        .json({ msg: "Exam time has expired", expired: true });
    }

    // Upsert answer (don't grade yet, grade on final submit)
    await pool.query(
      `INSERT INTO hardcore_test_answer (submission_id, question_id, user_answer, answered_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (submission_id, question_id)
       DO UPDATE SET user_answer = $3, answered_at = NOW()`,
      [sub.submission_id, question_id, JSON.stringify(answer)],
    );

    res.json({ msg: "Answer saved" });
  } catch (err) {
    console.error("Error saving answer:", err);
    res.status(500).json({ msg: "Failed to save answer" });
  }
}

// RECORD WARNING
async function recordWarning(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    const subResult = await pool.query(
      `SELECT * FROM hardcore_test_submission WHERE test_id = $1 AND user_id = $2`,
      [testId, userId],
    );

    if (
      subResult.rows.length === 0 ||
      subResult.rows[0].status !== "in_progress"
    ) {
      return res.status(400).json({ msg: "No active exam session" });
    }

    const sub = subResult.rows[0];
    const newCount = sub.warning_count + 1;

    if (newCount >= 3) {
      // Auto-close due to warnings
      await pool.query(
        `UPDATE hardcore_test_submission
         SET warning_count = $1, status = 'warned_out', finished_at = NOW()
         WHERE submission_id = $2`,
        [newCount, sub.submission_id],
      );
      return res.json({
        warning_count: newCount,
        closed: true,
        msg: "Exam closed due to 3 violations",
      });
    }

    await pool.query(
      `UPDATE hardcore_test_submission SET warning_count = $1 WHERE submission_id = $2`,
      [newCount, sub.submission_id],
    );

    res.json({
      warning_count: newCount,
      closed: false,
      remaining_warnings: 3 - newCount,
    });
  } catch (err) {
    console.error("Error recording warning:", err);
    res.status(500).json({ msg: "Failed to record warning" });
  }
}

// FINAL SUBMIT
async function submitExam(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    const subResult = await pool.query(
      `SELECT * FROM hardcore_test_submission WHERE test_id = $1 AND user_id = $2`,
      [testId, userId],
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ msg: "No submission found" });
    }

    const sub = subResult.rows[0];
    if (sub.status === "completed") {
      return res.status(400).json({ msg: "Exam already submitted" });
    }

    // Get all questions
    const questionsResult = await pool.query(
      `SELECT * FROM hardcore_test_question WHERE test_id = $1 ORDER BY question_order ASC`,
      [testId],
    );

    // Get all saved answers
    const answersResult = await pool.query(
      `SELECT * FROM hardcore_test_answer WHERE submission_id = $1`,
      [sub.submission_id],
    );
    const answerMap = {};
    answersResult.rows.forEach((a) => {
      answerMap[a.question_id] = a;
    });

    // Grade each question (skip non-question types)
    let totalPoints = 0;
    let earnedPoints = 0;

    for (const question of questionsResult.rows) {
      // Skip non-question types
      if (NON_ANSWERABLE_TYPES.has(question.question_type)) {
        continue;
      }

      totalPoints += question.points;
      const savedAnswer = answerMap[question.question_id];

      if (savedAnswer) {
        const { isCorrect, scoreRatio } = calculateQuestionScore(
          question,
          savedAnswer.user_answer,
        );
        const pointsEarned = Number(
          (Number(question.points || 0) * Number(scoreRatio || 0)).toFixed(4),
        );
        earnedPoints += pointsEarned;

        await pool.query(
          `UPDATE hardcore_test_answer
           SET is_correct = $1, points_earned = $2
           WHERE answer_id = $3`,
          [isCorrect, pointsEarned, savedAnswer.answer_id],
        );
      }
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    // Update submission
    await pool.query(
      `UPDATE hardcore_test_submission
       SET status = 'completed', finished_at = NOW(),
           score = $1, total_points = $2, earned_points = $3
       WHERE submission_id = $4`,
      [score.toFixed(2), totalPoints, earnedPoints, sub.submission_id],
    );

    res.json({
      msg: "Exam submitted successfully",
      score: parseFloat(score.toFixed(2)),
      earned_points: earnedPoints,
      total_points: totalPoints,
    });
  } catch (err) {
    console.error("Error submitting exam:", err);
    res.status(500).json({ msg: "Failed to submit exam" });
  }
}

// GET RESULT
async function getResult(req, res) {
  const { testId } = req.params;
  const userId = req.user.user_id;

  try {
    // Check if results are visible
    const examResult = await pool.query(
      `SELECT results_visible, title, total_questions, duration_minutes
       FROM hardcore_test WHERE test_id = $1`,
      [testId],
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }
    if (!examResult.rows[0].results_visible) {
      return res.status(403).json({
        msg: "Results are not yet available. Please check back later.",
      });
    }

    const subResult = await pool.query(
      `SELECT * FROM hardcore_test_submission WHERE test_id = $1 AND user_id = $2`,
      [testId, userId],
    );
    if (
      subResult.rows.length === 0 ||
      subResult.rows[0].status === "not_started"
    ) {
      return res.status(404).json({ msg: "No submission found" });
    }

    const submission = subResult.rows[0];

    // Get questions with answers
    const questionsResult = await pool.query(
      `SELECT q.question_id, q.question_order, q.question_type, q.question_data, q.audio_url, q.points,
              a.user_answer, a.is_correct, a.points_earned
       FROM hardcore_test_question q
       LEFT JOIN hardcore_test_answer a ON a.question_id = q.question_id AND a.submission_id = $2
       WHERE q.test_id = $1
       ORDER BY q.question_order ASC`,
      [testId, submission.submission_id],
    );

    res.json({
      exam: examResult.rows[0],
      submission: {
        score: submission.score,
        earned_points: submission.earned_points,
        total_points: submission.total_points,
        status: submission.status,
        started_at: submission.started_at,
        finished_at: submission.finished_at,
        warning_count: submission.warning_count,
      },
      questions: questionsResult.rows,
    });
  } catch (err) {
    console.error("Error getting result:", err);
    res.status(500).json({ msg: "Failed to get result" });
  }
}

module.exports = {
  getVisibleExams,
  getExamInfo,
  startExam,
  getTimeRemaining: getTimeRemaining_endpoint,
  saveAnswer,
  recordWarning,
  submitExam,
  getResult,
};
