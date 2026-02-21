const { pool } = require("../util/db");
const cloudinary = require("../config/cloudinary");

const NON_QUESTION_TYPES = new Set([
  "page_break",
  "reading_passage",
  "audio_block",
  "content_block",
]);

// Helper: upload audio buffer to Cloudinary
async function uploadAudioToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: "video", folder: "hardcore-exam-audio" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      )
      .end(buffer);
  });
}

// Helper: delete audio from Cloudinary by public_id
async function deleteAudioFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
  }
}

function normalizeAudioLink(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  try {
    new URL(raw);
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Normalize a timestamp string to a proper UTC ISO string.
 * Handles:
 *   - ISO strings with Z suffix ("2026-02-18T13:30:00.000Z") -> passed through
 *   - ISO strings with offset ("2026-02-18T19:00:00+05:30") -> converted to UTC
 *   - Raw datetime-local strings ("2026-02-18T19:00") -> treated as IST (+05:30) -> converted to UTC
 */
function normalizeTimestamp(val) {
  if (!val) return null;
  const str = String(val).trim();
  // If it already has timezone info (Z or +/-offset), just parse and return ISO
  if (/Z$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // No timezone info — this is a raw datetime-local from the admin's browser (IST)
  // Append IST offset so it's interpreted correctly
  const d = new Date(str + "+05:30");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// CREATE EXAM
async function createExam(req, res) {
  const {
    title,
    description,
    proficiency_level,
    duration_minutes,
    available_from,
    available_until,
  } = req.body;
  const created_by = req.user.user_id;

  if (!title || !title.trim()) {
    return res.status(400).json({ msg: "Title is required" });
  }
  if (!proficiency_level) {
    return res.status(400).json({ msg: "Proficiency level is required" });
  }
  if (!duration_minutes || duration_minutes < 1) {
    return res.status(400).json({ msg: "Duration must be at least 1 minute" });
  }

  // Validate scheduling
  if (available_from && available_until) {
    if (new Date(available_until) <= new Date(available_from)) {
      return res
        .status(400)
        .json({ msg: "available_until must be after available_from" });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO hardcore_test (title, description, proficiency_level, duration_minutes, created_by, available_from, available_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        title.trim(),
        description || null,
        proficiency_level,
        duration_minutes,
        created_by,
        normalizeTimestamp(available_from),
        normalizeTimestamp(available_until),
      ],
    );
    res.status(201).json({ exam: result.rows[0] });
  } catch (err) {
    console.error("Error creating exam:", err);
    res.status(500).json({ msg: "Failed to create exam" });
  }
}

// ADD QUESTION (with optional audio)
async function addQuestion(req, res) {
  const { testId } = req.params;
  const { question_type, question_data, points, audio_url } = req.body;

  if (!question_type || !question_data) {
    return res
      .status(400)
      .json({ msg: "question_type and question_data are required" });
  }

  // Parse question_data if it comes as string (from multipart form)
  let parsedData = question_data;
  if (typeof question_data === "string") {
    try {
      parsedData = JSON.parse(question_data);
    } catch (e) {
      return res.status(400).json({ msg: "Invalid question_data JSON" });
    }
  }

  // Non-question types get 0 points
  // audio_block is also a non-question but still allows audio upload
  const isNonQuestion = NON_QUESTION_TYPES.has(question_type);
  const finalPoints = isNonQuestion ? 0 : points || 1;

  // audio_block needs audio upload; page_break and reading_passage do not
  const skipAudio =
    question_type === "page_break" ||
    question_type === "reading_passage" ||
    question_type === "content_block";

  try {
    // Verify test exists
    const testCheck = await pool.query(
      `SELECT test_id FROM hardcore_test WHERE test_id = $1`,
      [testId],
    );
    if (testCheck.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }

    // Get next order
    const orderResult = await pool.query(
      `SELECT COALESCE(MAX(question_order), 0) + 1 AS next_order
       FROM hardcore_test_question WHERE test_id = $1`,
      [testId],
    );
    const nextOrder = orderResult.rows[0].next_order;

    // Upload audio if provided (skip for page_break and reading_passage only)
    let audioUrl = null;
    let audioPublicId = null;
    const linkedAudioUrl = normalizeAudioLink(audio_url);
    if (req.file && !skipAudio) {
      const result = await uploadAudioToCloudinary(req.file.buffer);
      audioUrl = result.secure_url;
      audioPublicId = result.public_id;
    } else if (linkedAudioUrl && !skipAudio) {
      audioUrl = linkedAudioUrl;
      audioPublicId = null;
    }

    const insertResult = await pool.query(
      `INSERT INTO hardcore_test_question (test_id, question_order, question_type, question_data, audio_url, audio_public_id, points)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        testId,
        nextOrder,
        question_type,
        JSON.stringify(parsedData),
        audioUrl,
        audioPublicId,
        finalPoints,
      ],
    );

    // Update total_questions count (exclude non-question types)
    await pool.query(
      `UPDATE hardcore_test SET total_questions = (
        SELECT COUNT(*) FROM hardcore_test_question
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block')
      ), updated_at = CURRENT_TIMESTAMP WHERE test_id = $1`,
      [testId],
    );

    res.status(201).json({ question: insertResult.rows[0] });
  } catch (err) {
    console.error("Error adding question:", err);
    res.status(500).json({ msg: "Failed to add question" });
  }
}

// EDIT QUESTION
async function editQuestion(req, res) {
  const { testId, questionId } = req.params;
  const { question_type, question_data, points, audio_url } = req.body;

  let parsedData = question_data;
  if (typeof question_data === "string") {
    try {
      parsedData = JSON.parse(question_data);
    } catch (e) {
      return res.status(400).json({ msg: "Invalid question_data JSON" });
    }
  }

  try {
    // Get existing question for audio cleanup
    const existing = await pool.query(
      `SELECT * FROM hardcore_test_question WHERE question_id = $1 AND test_id = $2`,
      [questionId, testId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ msg: "Question not found" });
    }

    let audioUrl = existing.rows[0].audio_url;
    let audioPublicId = existing.rows[0].audio_public_id;
    const linkedAudioUrl = normalizeAudioLink(audio_url);
    const nextType = question_type || existing.rows[0].question_type;

    // If new audio uploaded, delete old and upload new
    if (req.file) {
      await deleteAudioFromCloudinary(audioPublicId);
      const result = await uploadAudioToCloudinary(req.file.buffer);
      audioUrl = result.secure_url;
      audioPublicId = result.public_id;
    } else if (
      linkedAudioUrl &&
      nextType !== "page_break" &&
      nextType !== "reading_passage" &&
      nextType !== "content_block"
    ) {
      if (audioPublicId) {
        await deleteAudioFromCloudinary(audioPublicId);
      }
      audioUrl = linkedAudioUrl;
      audioPublicId = null;
    }

    const isNonQuestion = NON_QUESTION_TYPES.has(nextType);
    const finalPoints = isNonQuestion
      ? 0
      : points !== undefined && points !== null
        ? points
        : existing.rows[0].points;

    const updateResult = await pool.query(
      `UPDATE hardcore_test_question
       SET question_type = COALESCE($1, question_type),
           question_data = COALESCE($2, question_data),
           audio_url = $3,
           audio_public_id = $4,
           points = COALESCE($5, points)
       WHERE question_id = $6 AND test_id = $7
       RETURNING *`,
      [
        question_type || null,
        parsedData ? JSON.stringify(parsedData) : null,
        audioUrl,
        audioPublicId,
        finalPoints,
        questionId,
        testId,
      ],
    );

    await pool.query(
      `UPDATE hardcore_test SET total_questions = (
        SELECT COUNT(*) FROM hardcore_test_question
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block')
      ), updated_at = CURRENT_TIMESTAMP WHERE test_id = $1`,
      [testId],
    );

    res.json({ question: updateResult.rows[0] });
  } catch (err) {
    console.error("Error editing question:", err);
    res.status(500).json({ msg: "Failed to edit question" });
  }
}

// DELETE QUESTION (cleanup audio)
async function deleteQuestion(req, res) {
  const { testId, questionId } = req.params;
  try {
    // Get audio public_id for cleanup
    const existing = await pool.query(
      `SELECT audio_public_id FROM hardcore_test_question WHERE question_id = $1 AND test_id = $2`,
      [questionId, testId],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ msg: "Question not found" });
    }

    await deleteAudioFromCloudinary(existing.rows[0].audio_public_id);

    await pool.query(
      `DELETE FROM hardcore_test_question WHERE question_id = $1 AND test_id = $2`,
      [questionId, testId],
    );

    // Reorder remaining questions
    await pool.query(
      `WITH ordered AS (
        SELECT question_id, ROW_NUMBER() OVER (ORDER BY question_order) AS new_order
        FROM hardcore_test_question WHERE test_id = $1
      )
      UPDATE hardcore_test_question q
      SET question_order = o.new_order
      FROM ordered o
      WHERE q.question_id = o.question_id`,
      [testId],
    );

    // Update count (exclude non-question types)
    await pool.query(
      `UPDATE hardcore_test SET total_questions = (
        SELECT COUNT(*) FROM hardcore_test_question
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block')
      ), updated_at = CURRENT_TIMESTAMP WHERE test_id = $1`,
      [testId],
    );

    res.json({ msg: "Question deleted" });
  } catch (err) {
    console.error("Error deleting question:", err);
    res.status(500).json({ msg: "Failed to delete question" });
  }
}

// LIST EXAMS
async function listExams(req, res) {
  try {
    const result = await pool.query(
      `SELECT ht.*,
        (SELECT COUNT(*)::int FROM hardcore_test_submission WHERE test_id = ht.test_id AND status != 'not_started') AS submission_count
       FROM hardcore_test ht
       ORDER BY ht.created_at DESC`,
    );
    res.json({ exams: result.rows });
  } catch (err) {
    console.error("Error listing exams:", err);
    res.status(500).json({ msg: "Failed to list exams" });
  }
}

// GET EXAM DETAIL (with questions)
async function getExamDetail(req, res) {
  const { testId } = req.params;
  try {
    const examResult = await pool.query(
      `SELECT * FROM hardcore_test WHERE test_id = $1`,
      [testId],
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }

    const questionsResult = await pool.query(
      `SELECT * FROM hardcore_test_question WHERE test_id = $1 ORDER BY question_order ASC`,
      [testId],
    );

    res.json({
      exam: examResult.rows[0],
      questions: questionsResult.rows,
    });
  } catch (err) {
    console.error("Error getting exam detail:", err);
    res.status(500).json({ msg: "Failed to get exam detail" });
  }
}

// UPDATE EXAM METADATA
async function updateExam(req, res) {
  const { testId } = req.params;
  const {
    title,
    description,
    proficiency_level,
    duration_minutes,
    is_active,
    results_visible,
    available_from,
    available_until,
  } = req.body;

  // Validate scheduling if both provided
  if (available_from && available_until) {
    if (new Date(available_until) <= new Date(available_from)) {
      return res
        .status(400)
        .json({ msg: "available_until must be after available_from" });
    }
  }

  try {
    // Use explicit NULL handling for scheduling fields
    // (COALESCE won't work here because we need to allow clearing them)
    const result = await pool.query(
      `UPDATE hardcore_test
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           proficiency_level = COALESCE($3, proficiency_level),
           duration_minutes = COALESCE($4, duration_minutes),
           is_active = COALESCE($5, is_active),
           results_visible = COALESCE($6, results_visible),
           available_from = CASE WHEN $8 THEN $7::timestamptz ELSE available_from END,
           available_until = CASE WHEN $10 THEN $9::timestamptz ELSE available_until END,
           updated_at = CURRENT_TIMESTAMP
       WHERE test_id = $11
       RETURNING *`,
      [
        title,
        description,
        proficiency_level,
        duration_minutes,
        is_active,
        results_visible,
        normalizeTimestamp(available_from), // $7
        available_from !== undefined, // $8 — true if field was sent at all
        normalizeTimestamp(available_until), // $9
        available_until !== undefined, // $10 — true if field was sent at all
        testId, // $11
      ],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }
    res.json({ exam: result.rows[0] });
  } catch (err) {
    console.error("Error updating exam:", err);
    res.status(500).json({ msg: "Failed to update exam" });
  }
}

// DELETE EXAM (cleanup ALL audio)
async function deleteExam(req, res) {
  const { testId } = req.params;
  try {
    // Get all audio public_ids for cleanup
    const audioResult = await pool.query(
      `SELECT audio_public_id FROM hardcore_test_question WHERE test_id = $1 AND audio_public_id IS NOT NULL`,
      [testId],
    );

    // Delete from Cloudinary in parallel
    const deletePromises = audioResult.rows.map((row) =>
      deleteAudioFromCloudinary(row.audio_public_id),
    );
    await Promise.all(deletePromises);

    // Delete exam (cascades to questions, visibility, submissions, answers)
    const result = await pool.query(
      `DELETE FROM hardcore_test WHERE test_id = $1 RETURNING test_id`,
      [testId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }
    res.json({ msg: "Exam and all associated audio files deleted" });
  } catch (err) {
    console.error("Error deleting exam:", err);
    res.status(500).json({ msg: "Failed to delete exam" });
  }
}

// SET VISIBILITY
async function setVisibility(req, res) {
  const { testId } = req.params;
  const { batch_ids, user_ids } = req.body;

  if (
    (!batch_ids || batch_ids.length === 0) &&
    (!user_ids || user_ids.length === 0)
  ) {
    return res
      .status(400)
      .json({ msg: "At least one batch_id or user_id is required" });
  }

  try {
    const inserted = [];

    if (batch_ids && batch_ids.length > 0) {
      for (const batchId of batch_ids) {
        const result = await pool.query(
          `INSERT INTO hardcore_test_visibility (test_id, batch_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [testId, batchId],
        );
        if (result.rows.length > 0) inserted.push(result.rows[0]);
      }
    }

    if (user_ids && user_ids.length > 0) {
      for (const userId of user_ids) {
        const result = await pool.query(
          `INSERT INTO hardcore_test_visibility (test_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [testId, userId],
        );
        if (result.rows.length > 0) inserted.push(result.rows[0]);
      }
    }

    res.status(201).json({ visibility: inserted, count: inserted.length });
  } catch (err) {
    console.error("Error setting visibility:", err);
    res.status(500).json({ msg: "Failed to set visibility" });
  }
}

// GET VISIBILITY
async function getVisibility(req, res) {
  const { testId } = req.params;
  try {
    const batchVis = await pool.query(
      `SELECT v.id, v.batch_id, b.batch_name
       FROM hardcore_test_visibility v
       JOIN batch b ON b.batch_id = v.batch_id
       WHERE v.test_id = $1 AND v.batch_id IS NOT NULL`,
      [testId],
    );
    const userVis = await pool.query(
      `SELECT v.id, v.user_id, u.username, u.fullname
       FROM hardcore_test_visibility v
       JOIN app_user u ON u.user_id = v.user_id
       WHERE v.test_id = $1 AND v.user_id IS NOT NULL`,
      [testId],
    );
    res.json({
      batches: batchVis.rows,
      students: userVis.rows,
    });
  } catch (err) {
    console.error("Error getting visibility:", err);
    res.status(500).json({ msg: "Failed to get visibility" });
  }
}

// REMOVE VISIBILITY RULE
async function removeVisibility(req, res) {
  const { testId, visId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM hardcore_test_visibility WHERE id = $1 AND test_id = $2 RETURNING id`,
      [visId, testId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Visibility rule not found" });
    }
    res.json({ msg: "Visibility rule removed" });
  } catch (err) {
    console.error("Error removing visibility:", err);
    res.status(500).json({ msg: "Failed to remove visibility" });
  }
}

// GET SUBMISSIONS FOR EXAM
async function getSubmissions(req, res) {
  const { testId } = req.params;
  try {
    const result = await pool.query(
      `SELECT s.*, u.username, u.fullname
       FROM hardcore_test_submission s
       JOIN app_user u ON u.user_id = s.user_id
       WHERE s.test_id = $1
       ORDER BY s.started_at DESC`,
      [testId],
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error("Error getting submissions:", err);
    res.status(500).json({ msg: "Failed to get submissions" });
  }
}

// REOPEN TEST FOR STUDENT (warned_out, auto_closed, or completed)
async function reopenSubmission(req, res) {
  const { submissionId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE hardcore_test_submission
       SET status = 'in_progress',
           warning_count = 0,
           is_reopened = true,
           finished_at = NULL
       WHERE submission_id = $1
         AND status IN ('warned_out', 'auto_closed', 'completed')
       RETURNING *`,
      [submissionId],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ msg: "Submission not found or not eligible for reopen" });
    }
    res.json({ msg: "Test reopened for student", submission: result.rows[0] });
  } catch (err) {
    console.error("Error reopening submission:", err);
    res.status(500).json({ msg: "Failed to reopen submission" });
  }
}

// CLEAR + REOPEN FOR RETEST (full reset to start from scratch)
async function resetSubmissionForRetest(req, res) {
  const { submissionId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const subCheck = await client.query(
      `SELECT submission_id FROM hardcore_test_submission WHERE submission_id = $1`,
      [submissionId],
    );

    if (subCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: "Submission not found" });
    }

    await client.query(
      `DELETE FROM hardcore_test_answer WHERE submission_id = $1`,
      [submissionId],
    );

    const resetResult = await client.query(
      `UPDATE hardcore_test_submission
       SET status = 'not_started',
           warning_count = 0,
           started_at = NULL,
           finished_at = NULL,
           score = NULL,
           total_points = NULL,
           earned_points = NULL,
           is_reopened = true
       WHERE submission_id = $1
       RETURNING *`,
      [submissionId],
    );

    await client.query("COMMIT");

    res.json({
      msg: "Submission cleared and reopened for fresh retest",
      submission: resetResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error resetting submission for retest:", err);
    res.status(500).json({ msg: "Failed to clear and reopen submission" });
  } finally {
    client.release();
  }
}

// REORDER QUESTIONS
async function reorderQuestions(req, res) {
  const { testId } = req.params;
  const { question_ids } = req.body;

  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ msg: "question_ids array is required" });
  }

  try {
    for (let i = 0; i < question_ids.length; i++) {
      await pool.query(
        `UPDATE hardcore_test_question SET question_order = $1 WHERE question_id = $2 AND test_id = $3`,
        [i + 1, question_ids[i], testId],
      );
    }
    res.json({ msg: "Questions reordered" });
  } catch (err) {
    console.error("Error reordering questions:", err);
    res.status(500).json({ msg: "Failed to reorder questions" });
  }
}

module.exports = {
  createExam,
  addQuestion,
  editQuestion,
  deleteQuestion,
  listExams,
  getExamDetail,
  updateExam,
  deleteExam,
  setVisibility,
  getVisibility,
  removeVisibility,
  getSubmissions,
  reopenSubmission,
  resetSubmissionForRetest,
  reorderQuestions,
};
