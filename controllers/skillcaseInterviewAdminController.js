const { pool } = require("../util/db");
const {
  getInterviewUploadUrl,
  getInterviewDownloadUrl,
  listInterviewObjectKeys,
  deleteInterviewObjects,
} = require("../config/interviewS3");
const {
  generateShortSlug,
  sanitizeSlug,
  buildInterviewStorageKey,
  parseFileExtension,
} = require("../util/interviewToolsUtils");

const INTERVIEW_SCOPE = "skillcase_interviews";

function isSuperAdmin(req) {
  return Boolean(
    req?.adminAccess?.isSuperAdmin || req?.user?.role === "super_admin",
  );
}

async function getPositionAccess(positionId, req, db = pool) {
  const result = await db.query(
    `SELECT position_id, created_by FROM interview_position WHERE position_id = $1 AND interview_scope = $2`,
    [positionId, INTERVIEW_SCOPE],
  );

  if (!result.rows.length) {
    return { allowed: false, status: 404, message: "Position not found" };
  }

  if (isSuperAdmin(req) || result.rows[0].created_by === req.user.user_id) {
    return { allowed: true, position: result.rows[0] };
  }

  return { allowed: false, status: 403, message: "Access denied" };
}

async function buildPositionPayload(position) {
  const introVideoUrl = await getInterviewDownloadUrl(position.intro_video_key);
  const farewellVideoUrl = await getInterviewDownloadUrl(
    position.farewell_video_key,
  );

  const questionResult = await pool.query(
    `SELECT * FROM interview_position_question
     WHERE position_id = $1
     ORDER BY question_order ASC`,
    [position.position_id],
  );

  const questions = await Promise.all(
    questionResult.rows.map(async (row) => ({
      ...row,
      video_url: await getInterviewDownloadUrl(row.video_key),
    })),
  );

  return {
    ...position,
    details: position.role_title || "",
    intro_video_url: introVideoUrl,
    farewell_video_url: farewellVideoUrl,
    questions,
  };
}

async function ensureUniqueSlug(baseSlug, excludePositionId = null) {
  let slug = sanitizeSlug(baseSlug) || generateShortSlug();

  if (slug.length < 5) {
    slug = `${slug}-${generateShortSlug()}`;
  }

  while (true) {
    const params = [slug];
    let query = `SELECT position_id FROM interview_position WHERE slug = $1`;

    if (excludePositionId) {
      query += ` AND position_id <> $2`;
      params.push(excludePositionId);
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return slug;

    slug = generateShortSlug();
  }
}

async function getPositionSubmissionCount(positionId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM interview_submission WHERE position_id = $1`,
    [positionId],
  );

  return result.rows[0]?.count || 0;
}

async function listPositions(req, res) {
  try {
    const params = [INTERVIEW_SCOPE];
    let whereClause = "WHERE p.interview_scope = $1";

    if (!isSuperAdmin(req)) {
      whereClause += " AND p.created_by = $2";
      params.push(req.user.user_id);
    }

    const result = await pool.query(
      `SELECT
         p.*,
         p.role_title AS details,
         u.username AS created_by_username,
         (
           SELECT COUNT(*)::int
           FROM interview_position_question q
           WHERE q.position_id = p.position_id
         ) AS question_count,
         (
           SELECT COUNT(*)::int
           FROM interview_submission s
           WHERE s.position_id = p.position_id AND s.status = 'completed'
         ) AS completed_submission_count
       FROM interview_position p
       LEFT JOIN app_user u ON u.user_id = p.created_by
       ${whereClause}
       ORDER BY p.updated_at DESC`,
      params,
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    console.error("Error listing interview positions:", error);
    res.status(500).json({ message: "Could not fetch interview positions" });
  }
}

async function getPositionById(req, res) {
  const { positionId } = req.params;

  try {
    const access = await getPositionAccess(positionId, req);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const result = await pool.query(
      `SELECT * FROM interview_position WHERE position_id = $1`,
      [positionId],
    );

    const payload = await buildPositionPayload(result.rows[0]);
    res.status(200).json({ data: payload });
  } catch (error) {
    console.error("Error fetching interview position:", error);
    res.status(500).json({ message: "Could not fetch interview position" });
  }
}

async function getUploadUrl(req, res) {
  const { kind, positionId, questionId, submissionId, fileName, contentType } =
    req.body;

  if (!kind || !contentType) {
    return res
      .status(400)
      .json({ message: "kind and contentType are required" });
  }

  try {
    if (positionId) {
      const access = await getPositionAccess(positionId, req);
      if (!access.allowed) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    const ext = parseFileExtension(fileName, contentType);
    const key = buildInterviewStorageKey({
      kind,
      positionId,
      questionId,
      submissionId,
      ext,
    });

    const signed = await getInterviewUploadUrl({
      key,
      contentType,
      metadata: {
        kind: String(kind),
      },
    });

    res.status(200).json({
      data: {
        ...signed,
        contentType,
      },
    });
  } catch (error) {
    console.error("Error creating interview upload url:", error);
    res.status(500).json({ message: "Could not create upload url" });
  }
}

async function createPosition(req, res) {
  const {
    title,
    details,
    short_description = "",
    intro_video_key = null,
    intro_video_title = "",
    intro_video_description = "",
    farewell_video_key = null,
    farewell_video_title = "",
    farewell_video_description = "",
    thank_you_message = "",
    thinking_time_seconds,
    answer_time_seconds,
    allowed_retakes,
    slug,
    status = "draft",
    questions = [],
  } = req.body;

  const normalizedDetails = String(details || req.body.role_title || "").trim();

  if (
    !title ||
    !normalizedDetails ||
    !Array.isArray(questions) ||
    questions.length === 0
  ) {
    return res.status(400).json({
      message: "title, details and at least one question are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const finalSlug = await ensureUniqueSlug(slug || generateShortSlug());

    const insertResult = await client.query(
      `INSERT INTO interview_position (
         title,
         role_title,
         department,
         location,
         employment_type,
         short_description,
         intro_video_key,
         intro_video_title,
         intro_video_description,
         farewell_video_key,
         farewell_video_title,
         farewell_video_description,
         thank_you_message,
         thinking_time_seconds,
         answer_time_seconds,
         allowed_retakes,
         slug,
         status,
         created_by,
         intro_video_duration_seconds,
         farewell_video_duration_seconds
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
       )
       RETURNING *`,
      [
        title,
        normalizedDetails,
        "",
        "",
        "",
        short_description,
        intro_video_key,
        intro_video_title,
        intro_video_description,
        farewell_video_key,
        farewell_video_title,
        farewell_video_description,
        thank_you_message,
        thinking_time_seconds ?? 3,
        answer_time_seconds ?? null,
        allowed_retakes ?? 0,
        finalSlug,
        status,
        req.user.user_id,
        req.body.intro_video_duration_seconds ?? null,
        req.body.farewell_video_duration_seconds ?? null,
        INTERVIEW_SCOPE,
      ],
    );

    const position = insertResult.rows[0];

    for (let index = 0; index < questions.length; index += 1) {
      const item = questions[index];

      await client.query(
        `INSERT INTO interview_position_question (
           position_id,
           question_order,
           title,
           short_description,
           video_key,
           video_duration_seconds
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          position.position_id,
          index + 1,
          item.title,
          item.short_description || "",
          item.video_key,
          item.video_duration_seconds ?? null,
        ],
      );
    }

    await client.query("COMMIT");

    const finalPayload = await buildPositionPayload(position);
    res.status(201).json({ data: finalPayload });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating interview position:", error);
    res.status(500).json({ message: "Could not create interview position" });
  } finally {
    client.release();
  }
}

async function updatePosition(req, res) {
  const { positionId } = req.params;
  const access = await getPositionAccess(positionId, req);

  if (!access.allowed) {
    return res.status(access.status).json({ message: access.message });
  }

  const submissionCount = await getPositionSubmissionCount(positionId);

  if (submissionCount > 0) {
    return res.status(400).json({
      message:
        "This position already has submissions. Edit is locked to preserve review integrity.",
    });
  }

  const {
    title,
    details,
    short_description = "",
    intro_video_key = null,
    intro_video_title = "",
    intro_video_description = "",
    farewell_video_key = null,
    farewell_video_title = "",
    farewell_video_description = "",
    thank_you_message = "",
    thinking_time_seconds,
    answer_time_seconds,
    allowed_retakes,
    slug,
    status = "draft",
    questions = [],
  } = req.body;

  const normalizedDetails = String(details || req.body.role_title || "").trim();

  if (
    !title ||
    !normalizedDetails ||
    !Array.isArray(questions) ||
    questions.length === 0
  ) {
    return res.status(400).json({
      message: "title, details and at least one question are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const finalSlug = await ensureUniqueSlug(
      slug || generateShortSlug(),
      positionId,
    );

    const params = [
      title,
      normalizedDetails,
      "",
      "",
      "",
      short_description,
      intro_video_key,
      intro_video_title,
      intro_video_description,
      farewell_video_key,
      farewell_video_title,
      farewell_video_description,
      thank_you_message,
      thinking_time_seconds ?? 3,
      answer_time_seconds ?? null,
      allowed_retakes ?? 0,
      finalSlug,
      status,
      positionId,
      req.body.intro_video_duration_seconds ?? null,
      req.body.farewell_video_duration_seconds ?? null,
      INTERVIEW_SCOPE,
    ];

    let whereClause = "WHERE position_id = $19 AND interview_scope = $22";
    if (!isSuperAdmin(req)) {
      whereClause += " AND created_by = $23";
      params.push(req.user.user_id);
    }

    const result = await client.query(
      `UPDATE interview_position
       SET
         title = $1,
         role_title = $2,
         department = $3,
         location = $4,
         employment_type = $5,
         short_description = $6,
         intro_video_key = $7,
         intro_video_title = $8,
         intro_video_description = $9,
         farewell_video_key = $10,
         farewell_video_title = $11,
         farewell_video_description = $12,
         thank_you_message = $13,
         thinking_time_seconds = $14,
         answer_time_seconds = $15,
         allowed_retakes = $16,
         slug = $17,
         status = $18,
         intro_video_duration_seconds = $20,
         farewell_video_duration_seconds = $21,
         updated_at = NOW()
       ${whereClause}
       RETURNING *`,
      params,
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Position not found" });
    }

    await client.query(
      `DELETE FROM interview_position_question WHERE position_id = $1`,
      [positionId],
    );

    for (let index = 0; index < questions.length; index += 1) {
      const item = questions[index];

      await client.query(
        `INSERT INTO interview_position_question (
           position_id,
           question_order,
           title,
           short_description,
           video_key,
           video_duration_seconds
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          Number(positionId),
          index + 1,
          item.title,
          item.short_description || "",
          item.video_key,
          item.video_duration_seconds ?? null,
        ],
      );
    }

    await client.query("COMMIT");

    const payload = await buildPositionPayload(result.rows[0]);
    res.status(200).json({ data: payload });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating interview position:", error);
    res.status(500).json({ message: "Could not update interview position" });
  } finally {
    client.release();
  }
}

async function updatePositionStatus(req, res) {
  const { positionId } = req.params;
  const { status } = req.body;

  if (!["draft", "published_open", "published_closed"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const access = await getPositionAccess(positionId, req);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const params = [status, positionId, INTERVIEW_SCOPE];
    let whereClause = "WHERE position_id = $2 AND interview_scope = $3";
    if (!isSuperAdmin(req)) {
      whereClause += " AND created_by = $4";
      params.push(req.user.user_id);
    }

    const result = await pool.query(
      `UPDATE interview_position
       SET status = $1, updated_at = NOW()
       ${whereClause}
       RETURNING *`,
      params,
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Position not found" });
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    console.error("Error updating position status:", error);
    res.status(500).json({ message: "Could not update position status" });
  }
}

async function getCandidatesByPosition(req, res) {
  const { positionId } = req.params;

  try {
    const access = await getPositionAccess(positionId, req);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const result = await pool.query(
      `SELECT
         submission_id,
         position_id,
         candidate_name,
         candidate_email,
         candidate_phone,
         status,
         overall_review_status,
         calculated_score,
         overall_score,
         total_questions,
         current_question_index,
         started_at,
         completed_at,
         last_saved_at
       FROM interview_submission
       WHERE position_id = $1
       ORDER BY started_at DESC`,
      [positionId],
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    console.error("Error fetching position candidates:", error);
    res.status(500).json({ message: "Could not fetch candidate submissions" });
  }
}

async function getCandidateSubmissionDetail(req, res) {
  const { positionId, submissionId } = req.params;

  try {
    const access = await getPositionAccess(positionId, req);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const submissionResult = await pool.query(
      `SELECT *
       FROM interview_submission
       WHERE submission_id = $1
         AND position_id = $2`,
      [submissionId, positionId],
    );

    if (!submissionResult.rows.length) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const answersResult = await pool.query(
      `SELECT
         q.question_id,
         q.question_order,
         q.title,
         q.short_description,
         q.video_key AS question_video_key,
         q.video_duration_seconds,
         a.answer_id,
         a.answer_order,
         a.answer_video_key,
         a.answer_duration_seconds,
         a.retake_count,
         a.submitted_at,
         a.admin_score
       FROM interview_position_question q
       LEFT JOIN interview_submission_answer a
         ON a.question_id = q.question_id
        AND a.submission_id = $1
       WHERE q.position_id = $2
       ORDER BY q.question_order ASC`,
      [submissionId, positionId],
    );

    const answers = await Promise.all(
      answersResult.rows.map(async (row) => ({
        ...row,
        question_video_url: await getInterviewDownloadUrl(
          row.question_video_key,
        ),
        answer_video_url: await getInterviewDownloadUrl(row.answer_video_key),
      })),
    );

    res.status(200).json({
      data: {
        submission: submissionResult.rows[0],
        answers,
      },
    });
  } catch (error) {
    console.error("Error fetching candidate submission detail:", error);
    res.status(500).json({ message: "Could not fetch candidate submission" });
  }
}

async function reviewCandidateSubmission(req, res) {
  const { positionId, submissionId } = req.params;
  const {
    overall_review_status = "in_review",
    overall_score = null,
    question_reviews = [],
  } = req.body;

  if (
    !["completed", "in_review", "shortlisted", "rejected"].includes(
      overall_review_status,
    )
  ) {
    return res.status(400).json({ message: "Invalid overall review status" });
  }

  const client = await pool.connect();

  try {
    const access = await getPositionAccess(positionId, req, client);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    await client.query("BEGIN");

    const submissionResult = await client.query(
      `SELECT submission_id
       FROM interview_submission
       WHERE submission_id = $1
         AND position_id = $2`,
      [submissionId, positionId],
    );

    if (!submissionResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Submission not found" });
    }

    for (const item of question_reviews) {
      if (!item?.question_id) {
        continue;
      }

      await client.query(
        `UPDATE interview_submission_answer
         SET admin_score = $1
         WHERE submission_id = $2
           AND question_id = $3`,
        [item.admin_score ?? null, submissionId, item.question_id],
      );
    }

    const scoreResult = await client.query(
      `SELECT ROUND(AVG(admin_score::numeric), 2) AS calculated_score
       FROM interview_submission_answer
       WHERE submission_id = $1
         AND admin_score IS NOT NULL`,
      [submissionId],
    );

    const calculatedScore = scoreResult.rows[0]?.calculated_score || null;

    const updateResult = await client.query(
      `UPDATE interview_submission
       SET
         overall_review_status = $1,
         calculated_score = $2,
         overall_score = $3
       WHERE submission_id = $4
         AND position_id = $5
       RETURNING *`,
      [
        overall_review_status,
        calculatedScore,
        overall_score,
        submissionId,
        positionId,
      ],
    );

    await client.query("COMMIT");
    res.status(200).json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error reviewing candidate submission:", error);
    res.status(500).json({ message: "Could not save candidate review" });
  } finally {
    client.release();
  }
}

async function deletePosition(req, res) {
  const { positionId } = req.params;
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const access = await getPositionAccess(positionId, req, client);
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.message });
    }

    const positionResult = await client.query(
      `SELECT position_id, intro_video_key, farewell_video_key
       FROM interview_position
       WHERE position_id = $1`,
      [positionId],
    );

    if (!positionResult.rows.length) {
      return res.status(404).json({ message: "Position not found" });
    }

    const questionResult = await client.query(
      `SELECT video_key
       FROM interview_position_question
       WHERE position_id = $1`,
      [positionId],
    );

    const answerResult = await client.query(
      `SELECT a.answer_video_key
       FROM interview_submission_answer a
       INNER JOIN interview_submission s
         ON s.submission_id = a.submission_id
       WHERE s.position_id = $1`,
      [positionId],
    );

    const prefixKeys = await Promise.all([
      listInterviewObjectKeys(`interviews/${positionId}/`),
      listInterviewObjectKeys(`interview-submissions/${positionId}/`),
    ]);

    const directKeys = [
      positionResult.rows[0].intro_video_key,
      positionResult.rows[0].farewell_video_key,
      ...questionResult.rows.map((row) => row.video_key),
      ...answerResult.rows.map((row) => row.answer_video_key),
    ];

    await deleteInterviewObjects([...directKeys, ...prefixKeys.flat()]);

    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(
      `DELETE FROM interview_position
       WHERE position_id = $1`,
      [positionId],
    );
    await client.query("COMMIT");
    transactionStarted = false;

    res.status(200).json({ message: "Position deleted successfully" });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("Error deleting interview position:", error);
    res.status(500).json({ message: "Could not delete interview position" });
  } finally {
    client.release();
  }
}

module.exports = {
  listPositions,
  getPositionById,
  getUploadUrl,
  createPosition,
  updatePosition,
  updatePositionStatus,
  getCandidatesByPosition,
  getCandidateSubmissionDetail,
  reviewCandidateSubmission,
  deletePosition,
};
