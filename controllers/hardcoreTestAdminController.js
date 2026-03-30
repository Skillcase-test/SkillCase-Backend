const { pool } = require("../util/db");
const cloudinary = require("../config/cloudinary");

const NON_QUESTION_TYPES = new Set([
  "page_break",
  "reading_passage",
  "audio_block",
  "content_block",
  "image_block",
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

// Helper: upload image buffer to Cloudinary
async function uploadImageToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: "image", folder: "hardcore-exam-images" },
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

// ADD QUESTION (with optional audio and/or images)
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
  const isNonQuestion = NON_QUESTION_TYPES.has(question_type);
  const finalPoints = isNonQuestion ? 0 : points || 1;

  const skipAudio =
    question_type === "page_break" ||
    question_type === "reading_passage" ||
    question_type === "content_block" ||
    question_type === "image_block";

  // req.files is a dict from multer.fields()
  const files = req.files || {};
  const audioFileObj = files["audio"]?.[0];

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

    // -- Audio upload
    let audioUrl = null;
    let audioPublicId = null;
    const linkedAudioUrl = normalizeAudioLink(audio_url);
    if (audioFileObj && !skipAudio) {
      const result = await uploadAudioToCloudinary(audioFileObj.buffer);
      audioUrl = result.secure_url;
      audioPublicId = result.public_id;
    } else if (linkedAudioUrl && !skipAudio) {
      audioUrl = linkedAudioUrl;
      audioPublicId = null;
    }

    // -- Image block upload (image_block question type)
    const imageBlockFile = files["image_block_file"]?.[0];
    if (question_type === "image_block" && imageBlockFile) {
      const result = await uploadImageToCloudinary(imageBlockFile.buffer);
      parsedData.image_url = result.secure_url;
    }

    // -- Question image upload (shown above question text for any type)
    const questionImageFile = files["question_image_file"]?.[0];
    if (questionImageFile) {
      const result = await uploadImageToCloudinary(questionImageFile.buffer);
      parsedData.question_image = result.secure_url;
    }

    // -- Option image uploads: option_image_file_0 … option_image_file_9
    if (Array.isArray(parsedData.options)) {
      for (let i = 0; i < parsedData.options.length; i++) {
        const optFile = files[`option_image_file_${i}`]?.[0];
        if (optFile) {
          const result = await uploadImageToCloudinary(optFile.buffer);
          parsedData.options[i] = { type: "image", url: result.secure_url, alt: "" };
        }
      }
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
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block', 'image_block')
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

  // req.files is a dict from multer.fields()
  const files = req.files || {};
  const audioFileObj = files["audio"]?.[0];

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

    const skipAudio =
      nextType === "page_break" ||
      nextType === "reading_passage" ||
      nextType === "content_block" ||
      nextType === "image_block";

    // If new audio uploaded, delete old and upload new
    if (audioFileObj && !skipAudio) {
      await deleteAudioFromCloudinary(audioPublicId);
      const result = await uploadAudioToCloudinary(audioFileObj.buffer);
      audioUrl = result.secure_url;
      audioPublicId = result.public_id;
    } else if (linkedAudioUrl && !skipAudio) {
      // New link-based audio provided
      if (audioPublicId) {
        await deleteAudioFromCloudinary(audioPublicId);
      }
      audioUrl = linkedAudioUrl;
      audioPublicId = null;
    } else if (
      !audioFileObj &&
      audio_url !== undefined &&
      (audio_url === "" || audio_url === null) &&
      !skipAudio
    ) {
      // Audio explicitly cleared by admin
      await deleteAudioFromCloudinary(audioPublicId);
      audioUrl = null;
      audioPublicId = null;
    }

    // -- Image block upload
    const imageBlockFile = files["image_block_file"]?.[0];
    if (nextType === "image_block" && imageBlockFile) {
      const result = await uploadImageToCloudinary(imageBlockFile.buffer);
      parsedData.image_url = result.secure_url;
    }

    // -- Question image upload
    const questionImageFile = files["question_image_file"]?.[0];
    if (questionImageFile) {
      const result = await uploadImageToCloudinary(questionImageFile.buffer);
      parsedData.question_image = result.secure_url;
    }

    // -- Option image uploads
    if (Array.isArray(parsedData?.options)) {
      for (let i = 0; i < parsedData.options.length; i++) {
        const optFile = files[`option_image_file_${i}`]?.[0];
        if (optFile) {
          const result = await uploadImageToCloudinary(optFile.buffer);
          parsedData.options[i] = { type: "image", url: result.secure_url, alt: "" };
        }
      }
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
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block', 'image_block')
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
        WHERE test_id = $1 AND question_type NOT IN ('page_break', 'reading_passage', 'audio_block', 'content_block', 'image_block')
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
    // 1. Auto-close and grade any expired in_progress submissions
    const examResult = await pool.query(
      `SELECT duration_minutes, available_until FROM hardcore_test WHERE test_id = $1`,
      [testId]
    );

    if (examResult.rows.length > 0) {
      const exam = examResult.rows[0];
      const activeSubs = await pool.query(
        `SELECT submission_id, started_at FROM hardcore_test_submission 
         WHERE test_id = $1 AND status = 'in_progress'`,
        [testId]
      );

      if (activeSubs.rows.length > 0) {
        const { gradeSubmission } = require("./hardcoreTestController");
        const now = new Date();
        const availableUntil = exam.available_until ? new Date(exam.available_until) : null;

        for (const sub of activeSubs.rows) {
          let isExpired = false;

          // Check against hard deadline
          if (availableUntil && now > availableUntil) {
            isExpired = true;
          } 
          // Check against duration (allow 1 minute grace period)
          else if (exam.duration_minutes) {
            const startTime = new Date(sub.started_at);
            const elapsedMs = now.getTime() - startTime.getTime();
            if (elapsedMs > (exam.duration_minutes + 1) * 60 * 1000) {
              isExpired = true;
            }
          }

          if (isExpired) {
            try {
              await gradeSubmission(testId, sub.submission_id, "auto_closed");
            } catch (gradeErr) {
              console.error(`Error auto-grading submission ${sub.submission_id}:`, gradeErr);
            }
          }
        }
      }
    }

    // 2. Fetch all submissions to return
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

// GET FULL SUBMISSION DETAIL (admin)
async function getSubmissionDetail(req, res) {
  const { submissionId } = req.params;
  try {
    const subResult = await pool.query(
      `SELECT s.*, u.username, u.fullname,
              t.title, t.duration_minutes, t.test_id
       FROM hardcore_test_submission s
       JOIN app_user u ON u.user_id = s.user_id
       JOIN hardcore_test t ON t.test_id = s.test_id
       WHERE s.submission_id = $1`,
      [submissionId],
    );
    if (subResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Submission not found' });
    }
    const submission = subResult.rows[0];

    const questionsResult = await pool.query(
      `SELECT q.question_id, q.question_order, q.question_type,
              q.question_data, q.audio_url, q.points,
              a.user_answer, a.is_correct, a.points_earned
       FROM hardcore_test_question q
       LEFT JOIN hardcore_test_answer a
         ON a.question_id = q.question_id AND a.submission_id = $2
       WHERE q.test_id = $1
       ORDER BY q.question_order ASC`,
      [submission.test_id, submissionId],
    );

    res.json({
      submission: {
        submission_id: submission.submission_id,
        username: submission.username,
        fullname: submission.fullname,
        status: submission.status,
        score: submission.score,
        earned_points: submission.earned_points,
        total_points: submission.total_points,
        started_at: submission.started_at,
        finished_at: submission.finished_at,
        exam_title: submission.title,
      },
      questions: questionsResult.rows,
    });
  } catch (err) {
    console.error('Error getting submission detail:', err);
    res.status(500).json({ msg: 'Failed to get submission detail' });
  }
}

// OVERRIDE ANSWER CORRECTNESS (admin)
async function overrideAnswer(req, res) {
  const { submissionId, questionId } = req.params;
  try {
    // Get the answer row and the question's points
    const answerResult = await pool.query(
      `SELECT a.is_correct, a.points_earned, q.points
       FROM hardcore_test_answer a
       JOIN hardcore_test_question q ON q.question_id = a.question_id
       WHERE a.submission_id = $1 AND a.question_id = $2`,
      [submissionId, questionId],
    );

    if (answerResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Answer not found' });
    }

    const { is_correct, points } = answerResult.rows[0];
    const newIsCorrect = !is_correct;
    const newPointsEarned = newIsCorrect ? parseFloat(points) : 0;

    // Update the answer row
    await pool.query(
      `UPDATE hardcore_test_answer
       SET is_correct = $1, points_earned = $2
       WHERE submission_id = $3 AND question_id = $4`,
      [newIsCorrect, newPointsEarned, submissionId, questionId],
    );

    // Recalculate earned_points using stored total_points (NOT from answer rows,
    // since unanswered questions have no rows and would make total too low)
    const recalcResult = await pool.query(
      `SELECT
         COALESCE(SUM(a.points_earned), 0) AS earned_points,
         s.total_points
       FROM hardcore_test_answer a
       JOIN hardcore_test_submission s ON s.submission_id = a.submission_id
       WHERE a.submission_id = $1
       GROUP BY s.total_points`,
      [submissionId],
    );

    const earned_points = parseFloat(recalcResult.rows[0]?.earned_points || 0);
    const total_points = parseFloat(recalcResult.rows[0]?.total_points || 0);
    const score = total_points > 0
      ? parseFloat(((earned_points / total_points) * 100).toFixed(2))
      : 0;

    await pool.query(
      `UPDATE hardcore_test_submission
       SET earned_points = $1, score = $2
       WHERE submission_id = $3`,
      [earned_points, score, submissionId],
    );

    res.json({
      is_correct: newIsCorrect,
      points_earned: newPointsEarned,
      earned_points: parseFloat(earned_points),
      score,
    });
  } catch (err) {
    console.error('Error overriding answer:', err);
    res.status(500).json({ msg: 'Failed to override answer' });
  }
}

// OVERRIDE ANSWER WITH CUSTOM POINTS (for composite partial credit)
async function overrideAnswerPoints(req, res) {
  const { submissionId, questionId } = req.params;
  const { points_earned } = req.body;

  if (points_earned === undefined || points_earned === null || isNaN(Number(points_earned))) {
    return res.status(400).json({ msg: 'points_earned is required and must be a number' });
  }

  try {
    // Get the question's max points
    const answerResult = await pool.query(
      `SELECT q.points
       FROM hardcore_test_answer a
       JOIN hardcore_test_question q ON q.question_id = a.question_id
       WHERE a.submission_id = $1 AND a.question_id = $2`,
      [submissionId, questionId],
    );

    if (answerResult.rows.length === 0) {
      return res.status(404).json({ msg: 'Answer not found' });
    }

    const maxPoints = parseFloat(answerResult.rows[0].points || 0);
    const newPointsEarned = Math.min(Math.max(parseFloat(points_earned), 0), maxPoints);
    const newIsCorrect = newPointsEarned >= maxPoints;

    await pool.query(
      `UPDATE hardcore_test_answer
       SET is_correct = $1, points_earned = $2
       WHERE submission_id = $3 AND question_id = $4`,
      [newIsCorrect, newPointsEarned, submissionId, questionId],
    );

    // Recalculate submission score using stored total_points
    const recalcResult = await pool.query(
      `SELECT
         COALESCE(SUM(a.points_earned), 0) AS earned_points,
         s.total_points
       FROM hardcore_test_answer a
       JOIN hardcore_test_submission s ON s.submission_id = a.submission_id
       WHERE a.submission_id = $1
       GROUP BY s.total_points`,
      [submissionId],
    );

    const earned_points = parseFloat(recalcResult.rows[0]?.earned_points || 0);
    const total_points = parseFloat(recalcResult.rows[0]?.total_points || 0);
    const score = total_points > 0
      ? parseFloat(((earned_points / total_points) * 100).toFixed(2))
      : 0;

    await pool.query(
      `UPDATE hardcore_test_submission
       SET earned_points = $1, score = $2
       WHERE submission_id = $3`,
      [earned_points, score, submissionId],
    );

    res.json({
      is_correct: newIsCorrect,
      points_earned: newPointsEarned,
      earned_points,
      score,
    });
  } catch (err) {
    console.error('Error overriding answer points:', err);
    res.status(500).json({ msg: 'Failed to override answer points' });
  }
}

// Helper: format a raw DB answer value to a human-readable string for Excel
function formatAnswerForExcel(userAnswer, questionData, questionType) {
  if (userAnswer === null || userAnswer === undefined) return "—";

  // Parse if still a JSON string
  let ans = userAnswer;
  if (typeof ans === "string") {
    try { ans = JSON.parse(ans); } catch { /* keep as string */ }
  }

  const opts = questionData?.options;
  const subLabels = "abcdefghijklmnopqrstuvwxyz";

  // MCQ single — answer is an index into options
  if (questionType === "mcq_single" || questionType === "mcq") {
    if (typeof ans === "number" && opts?.[ans] !== undefined) {
      const opt = opts[ans];
      return typeof opt === "object" ? "[image]" : String(opt);
    }
    return String(ans);
  }

  // MCQ multi — answer is an array of indices
  if (questionType === "mcq_multi") {
    const arr = Array.isArray(ans) ? ans : [];
    return arr.map((i) => {
      const opt = opts?.[i];
      return typeof opt === "object" ? "[image]" : String(opt ?? i);
    }).join(", ") || "—";
  }

  // True / False
  if (questionType === "true_false" || questionType === "truefalse") {
    return ans === true || ans === "true" ? "True" : "False";
  }

  // Fill blank (options) — answer is an index into options
  if (questionType === "fill_options" || questionType === "fill_blank_options") {
    if (typeof ans === "number" && opts?.[ans] !== undefined) {
      const opt = opts[ans];
      return typeof opt === "object" ? "[image]" : String(opt);
    }
    return String(ans);
  }

  // Fill blank (typing) — answer is already plain text
  if (questionType === "fill_typing" || questionType === "fill_blank_typing") {
    return String(ans ?? "—");
  }

  // Sentence ordering
  if (questionType === "sentence_ordering" || questionType === "sentence_reorder") {
    return Array.isArray(ans) ? ans.join(" → ") : String(ans);
  }

  // Sentence correction — answer is plain text
  if (questionType === "sentence_correction") {
    return String(ans ?? "—");
  }

  // Matching
  if (questionType === "matching") {
    const pairs = Array.isArray(ans) ? ans : [];
    const left = questionData?.left || [];
    const right = questionData?.right || [];
    return pairs.map((p) => `${left[p[0]] ?? p[0]} ↔ ${right[p[1]] ?? p[1]}`).join(", ");
  }

  // Composite question — sub-items use (a)/(b)/... labels
  // Sub-item values may be indices (for dropdown/option types) or plain text (for blanks)
  if (questionType === "composite_question") {
    if (typeof ans === "object" && !Array.isArray(ans)) {
      const items = Array.isArray(questionData?.items) ? questionData.items : [];
      return Object.keys(ans)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => {
          const idx = Number(k);
          const v = ans[k];
          const item = items[idx];
          const label = subLabels[idx] ?? String(idx + 1);

          // Dropdown / option sub-items store an index — resolve to text
          if (item?.type === "dropdown" || item?.type === "option") {
            const itemOpts = Array.isArray(item.options) ? item.options : [];
            if (typeof v === "number" && itemOpts[v] !== undefined) {
              return `(${label}). ${String(itemOpts[v])}`;
            }
            return `(${label}). ${String(v ?? "(blank)")}`;
          }

          // Blank sub-items — value is already text or array of texts
          const display = Array.isArray(v) ? v.join(", ") : String(v ?? "(blank)");
          return `(${label}). ${display}`;
        })
        .join(" | ");
    }
  }

  // Dialogue dropdown — answer is { lineIndex: chosenOptionIndex }
  if (questionType === "dialogue_dropdown") {
    if (typeof ans === "object" && !Array.isArray(ans)) {
      const dialogue = questionData?.dialogue || [];
      return Object.keys(ans)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => {
          const line = dialogue[Number(k)];
          const rawVal = ans[k];
          if (line?.options && typeof rawVal === "number" && line.options[rawVal] !== undefined) {
            return String(line.options[rawVal]);
          }
          if (line?.options && typeof rawVal === "number") {
            return `(option ${rawVal + 1})`;
          }
          return String(rawVal ?? "—");
        })
        .join(" / ");
    }
  }

  if (Array.isArray(ans)) return ans.join(", ");

  return String(ans);
}

const ExcelJS = require("exceljs");

// EXPORT SUBMISSIONS AS EXCEL
async function exportSubmissionsExcel(req, res) {
  const { testId } = req.params;
  try {
    // Exam info
    const examResult = await pool.query(
      `SELECT title FROM hardcore_test WHERE test_id = $1`,
      [testId],
    );
    if (examResult.rows.length === 0) {
      return res.status(404).json({ msg: "Exam not found" });
    }
    const examTitle = examResult.rows[0].title;

    // Questions (ordered, skip non-answerable layout types)
    const questionsResult = await pool.query(
      `SELECT question_id, question_order, question_type, question_data, points
       FROM hardcore_test_question
       WHERE test_id = $1
         AND question_type NOT IN ('page_break','reading_passage','audio_block','content_block','image_block')
       ORDER BY question_order ASC`,
      [testId],
    );
    const questions = questionsResult.rows;

    // All finished submissions (completed, auto_closed, warned_out)
    const subsResult = await pool.query(
      `SELECT s.submission_id, s.score, s.earned_points, s.total_points,
              u.fullname, u.username
       FROM hardcore_test_submission s
       JOIN app_user u ON u.user_id = s.user_id
       WHERE s.test_id = $1 AND s.status != 'in_progress'
       ORDER BY u.fullname ASC`,
      [testId],
    );
    const submissions = subsResult.rows;

    if (submissions.length === 0) {
      return res.status(404).json({ msg: "No finished submissions found" });
    }

    // Answers for all submissions at once
    const submissionIds = submissions.map((s) => s.submission_id);
    const answersResult = await pool.query(
      `SELECT submission_id, question_id, user_answer, is_correct, points_earned
       FROM hardcore_test_answer
       WHERE submission_id = ANY($1)`,
      [submissionIds],
    );

    // Map: submissionId -> { questionId -> answerRow }
    const answerMap = {};
    for (const row of answersResult.rows) {
      if (!answerMap[row.submission_id]) answerMap[row.submission_id] = {};
      answerMap[row.submission_id][row.question_id] = row;
    }

    // ── Build workbook ────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SkillCase Admin";
    workbook.created = new Date();

    const ws = workbook.addWorksheet("Submissions", {
      views: [{ state: "frozen", xSplit: 4, ySplit: 1 }],
    });

    // ── Column definitions ─────────────────────────────────────────
    const fixedCols = [
      { header: "#", key: "num", width: 5 },
      { header: "Question", key: "question", width: 45 },
      { header: "Type", key: "type", width: 18 },
      { header: "Correct Answer", key: "correct", width: 30 },
    ];
    const studentCols = submissions.map((s) => ({
      header: `${s.fullname || s.username}\n@${s.username}`,
      key: `s_${s.submission_id}`,
      width: 28,
    }));
    ws.columns = [...fixedCols, ...studentCols];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002856" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF334155" } },
        right: { style: "thin", color: { argb: "FF334155" } },
      };
    });

    // ── Question rows ──────────────────────────────────────────────
    questions.forEach((q, qIdx) => {
      const qData = typeof q.question_data === "string"
        ? JSON.parse(q.question_data)
        : (q.question_data || {});

      const qText = (
        qData.question?.trim() ||
        qData.title?.trim() ||
        qData.text?.trim() ||
        qData.instructions?.trim() ||
        qData.passage?.trim() ||
        qData.reading_passage?.trim() ||
        qData.incorrect_sentence?.trim() ||
        `Question ${qIdx + 1}`
      );

      // Determine correct answer label
      const subLabels = "abcdefghijklmnopqrstuvwxyz";
      let correctLabel = "";
      if (q.question_type === "paragraph") {
        correctLabel = "(manual grading)";
      } else if (q.question_type === "true_false" || q.question_type === "truefalse") {
        correctLabel = String(qData.correct);
      } else if (q.question_type === "sentence_ordering" || q.question_type === "sentence_reorder") {
        correctLabel = (qData.correct_order || []).join(" → ");
      } else if (q.question_type === "sentence_correction") {
        correctLabel = String(qData.correct_sentence || qData.correct || "");
      } else if (q.question_type === "matching") {
        const left = qData.left || [];
        const right = qData.right || [];
        correctLabel = (qData.correct_pairs || []).map((p) => `${left[p[0]]} ↔ ${right[p[1]]}`).join(", ");
      } else if (q.question_type === "mcq_single" || q.question_type === "mcq") {
        const opts = qData.options;
        if (typeof qData.correct === "number" && opts?.[qData.correct] !== undefined) {
          const opt = opts[qData.correct];
          correctLabel = typeof opt === "object" ? "[image]" : String(opt);
        } else {
          correctLabel = String(qData.correct ?? "");
        }
      } else if (q.question_type === "mcq_multi") {
        const opts = qData.options;
        const correctArr = qData.correct || [];
        correctLabel = correctArr.map((c) => {
          if (typeof c === "number" && opts?.[c] !== undefined) {
            const opt = opts[c];
            return typeof opt === "object" ? "[image]" : String(opt);
          }
          return String(c);
        }).join(", ");
      } else if (q.question_type === "fill_options" || q.question_type === "fill_blank_options") {
        const opts = qData.options;
        if (typeof qData.correct === "number" && opts?.[qData.correct] !== undefined) {
          const opt = opts[qData.correct];
          correctLabel = typeof opt === "object" ? "[image]" : String(opt);
        } else {
          correctLabel = String(qData.correct ?? "");
        }
      } else if (q.question_type === "composite_question") {
        const items = Array.isArray(qData.items) ? qData.items : [];
        correctLabel = items.map((item, idx) => {
          const label = subLabels[idx] ?? String(idx + 1);
          const itemOpts = Array.isArray(item?.options) ? item.options : [];
          const correctVal = item?.correct;
          if ((item?.type === "dropdown" || item?.type === "option") && typeof correctVal === "number" && itemOpts[correctVal] !== undefined) {
            return `(${label}). ${String(itemOpts[correctVal])}`;
          }
          const display = Array.isArray(correctVal) ? correctVal.join(", ") : String(correctVal ?? "");
          return `(${label}). ${display}`;
        }).join(" | ");
      } else if (q.question_type === "dialogue_dropdown") {
        const dialogue = qData.dialogue || [];
        const resolved = dialogue
          .map((line, idx) => {
            // Only process dropdown lines (text === null and has options)
            if (!line.options) return null;
            const label = subLabels[idx] ?? String(idx + 1);
            const opts = line.options || [];
            if (typeof line.correct === "number" && opts[line.correct] !== undefined) {
              return `(${label}). ${String(opts[line.correct])}`;
            }
            return null;
          })
          .filter(Boolean);
        correctLabel = resolved.length > 0 ? resolved.join(" | ") : "(see dropdown)";
      } else {
        correctLabel = String(qData.correct ?? qData.correct_sentence ?? qData.correct_answer ?? "");
      }

      // ── Composite question: one row per sub-item ──────────────────
      if (q.question_type === "composite_question") {
        const items = Array.isArray(qData.items) ? qData.items : [];

        items.forEach((item, subIdx) => {
          const label = subLabels[subIdx] ?? String(subIdx + 1);
          const itemOpts = Array.isArray(item?.options) ? item.options : [];
          const correctVal = item?.correct;

          // Resolve correct answer text for this sub-item
          let subCorrect = "";
          if (item?.type === "dropdown" || item?.type === "option") {
            if (typeof correctVal === "number" && itemOpts[correctVal] !== undefined) {
              subCorrect = String(itemOpts[correctVal]);
            } else {
              subCorrect = String(correctVal ?? "");
            }
          } else {
            subCorrect = Array.isArray(correctVal) ? correctVal.join(", ") : String(correctVal ?? "");
          }

          // Use sub-item's own text (e.g. fill-blank sentence) if available,
          // otherwise fall back to the parent question text.
          const subQText = item.text?.trim() || item.prompt?.trim() || qText;

          const subRowData = {
            num: `${qIdx + 1}(${label})`,
            question: subQText,
            type: "composite part",
            correct: subCorrect,
          };

          // Resolve a single sub-item raw value to display text
          function resolveSubItem(v) {
            if (v === undefined || v === null) return "—";
            if (item?.type === "dropdown" || item?.type === "option") {
              if (typeof v === "number" && itemOpts[v] !== undefined) return String(itemOpts[v]);
              return String(v);
            }
            return Array.isArray(v) ? v.join(", ") : String(v);
          }

          // Check per-sub-item correctness inline (DB only stores whole-question is_correct)
          function isSubItemCorrect(v) {
            if (v === undefined || v === null) return null;
            if (item?.type === "dropdown" || item?.type === "option") {
              return typeof v === "number" && v === item.correct;
            }
            const strip = (s) => String(s).replace(/[.,!?;:'"()]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
            const correctBlanks = Array.isArray(item.correct) ? item.correct : [item.correct ?? ""];
            const userBlanks = Array.isArray(v) ? v : [v];
            if (correctBlanks.length !== userBlanks.length) return false;
            return correctBlanks.every((c, i) => strip(c) === strip(userBlanks[i] ?? ""));
          }

          // Fill each student's cell for this sub-item
          for (const sub of submissions) {
            const ansRow = answerMap[sub.submission_id]?.[q.question_id];
            let rawAns = ansRow?.user_answer ?? null;
            if (typeof rawAns === "string") {
              try { rawAns = JSON.parse(rawAns); } catch { /* keep */ }
            }
            let subVal = null;
            if (rawAns && typeof rawAns === "object" && !Array.isArray(rawAns)) {
              subVal = rawAns[subIdx] ?? rawAns[String(subIdx)] ?? null;
            }
            subRowData[`s_${sub.submission_id}`] = resolveSubItem(subVal);
          }

          const subRow = ws.addRow(subRowData);
          subRow.height = 22;

          // Colour each student's cell with per-sub-item correctness
          submissions.forEach((sub, sIdx) => {
            const ansRow = answerMap[sub.submission_id]?.[q.question_id];
            const cell = subRow.getCell(fixedCols.length + sIdx + 1);
            cell.alignment = { wrapText: true, vertical: "top" };

            let rawAns = ansRow?.user_answer ?? null;
            if (typeof rawAns === "string") {
              try { rawAns = JSON.parse(rawAns); } catch { /* keep */ }
            }
            let subVal = null;
            if (rawAns && typeof rawAns === "object" && !Array.isArray(rawAns)) {
              subVal = rawAns[subIdx] ?? rawAns[String(subIdx)] ?? null;
            }

            const correctness = isSubItemCorrect(subVal);
            if (correctness === true) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }; // green
            } else if (correctness === false) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // red
            }
            if (!ansRow) {
              cell.font = { italic: true, color: { argb: "FF9CA3AF" } };
            }
          });

          // Zebra stripe alternate sub-rows
          if (subIdx % 2 !== 0) {
            subRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
              if (colNum <= fixedCols.length && !cell.fill?.fgColor) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
              }
            });
          }
        });

        return; // Skip normal single-row path for composite questions
      }

      // ── All other question types: single row ───────────────────────
      const rowData = {
        num: qIdx + 1,
        question: qText,
        type: q.question_type.replace(/_/g, " "),
        correct: correctLabel,
      };

      // Each student's answer for this question
      for (const sub of submissions) {
        const ansRow = answerMap[sub.submission_id]?.[q.question_id];
        let rawAns = ansRow?.user_answer ?? null;
        if (typeof rawAns === "string") {
          try { rawAns = JSON.parse(rawAns); } catch { /* keep */ }
        }
        const formatted = formatAnswerForExcel(rawAns, qData, q.question_type);
        rowData[`s_${sub.submission_id}`] = formatted;
      }

      const row = ws.addRow(rowData);
      row.height = 22;

      // Colour each student answer cell
      submissions.forEach((sub, sIdx) => {
        const ansRow = answerMap[sub.submission_id]?.[q.question_id];
        const isCorrect = ansRow?.is_correct;
        const cell = row.getCell(fixedCols.length + sIdx + 1);
        cell.alignment = { wrapText: true, vertical: "top" };
        if (isCorrect === true) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } }; // green
        } else if (isCorrect === false) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // red
        } else if (isCorrect === null && ansRow) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }; // amber (pending)
        }
        if (!ansRow) {
          cell.font = { italic: true, color: { argb: "FF9CA3AF" } };
        }
      });

      // Zebra stripe odd rows
      if ((qIdx + 1) % 2 === 0) {
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (colNum <= fixedCols.length && !cell.fill?.fgColor) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          }
        });
      }
    });

    // ── Score summary rows ─────────────────────────────────────────
    ws.addRow({}); // spacer

    const scoreRow = ws.addRow({
      num: "",
      question: "Score (%)",
      type: "",
      correct: "",
      ...Object.fromEntries(
        submissions.map((s) => [
          `s_${s.submission_id}`,
          s.score !== null ? `${parseFloat(s.score).toFixed(1)}%` : "—",
        ]),
      ),
    });
    scoreRow.height = 22;
    scoreRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    });

    const ptsRow = ws.addRow({
      num: "",
      question: "Points Earned",
      type: "",
      correct: "",
      ...Object.fromEntries(
        submissions.map((s) => [
          `s_${s.submission_id}`,
          `${parseFloat(s.earned_points || 0).toFixed(2)} / ${parseFloat(s.total_points || 0).toFixed(2)}`,
        ]),
      ),
    });
    ptsRow.height = 22;
    ptsRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
    });

    // ── Send response ──────────────────────────────────────────────
    const safeTitle = examTitle.replace(/[^a-z0-9_\-]/gi, "_").slice(0, 40);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}_submissions.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error exporting submissions excel:", err);
    res.status(500).json({ msg: "Failed to export submissions" });
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
  getSubmissionDetail,
  overrideAnswer,
  overrideAnswerPoints,
  exportSubmissionsExcel,
};
