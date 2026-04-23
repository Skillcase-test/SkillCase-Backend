const { pool } = require("../util/db");
const crypto = require("crypto");
const {
  getInterviewUploadUrl,
  getInterviewDownloadUrl,
  listInterviewObjectKeys,
  deleteInterviewObjects,
  copyInterviewObject,
} = require("../config/interviewS3");
const {
  generateShortSlug,
  sanitizeSlug,
  buildInterviewStorageKey,
  parseFileExtension,
} = require("../util/interviewToolsUtils");

const INTERVIEW_SCOPE = "interview_tools";

function getKeyExtension(key = "", fallback = "webm") {
  const match = String(key).match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() || fallback;
}

async function cloneInterviewMediaKey({
  sourceKey,
  kind,
  positionId,
  questionId = null,
}) {
  if (!sourceKey) return null;

  const ext = getKeyExtension(sourceKey);
  const destinationKey = buildInterviewStorageKey({
    kind,
    positionId,
    questionId,
    ext,
  });

  await copyInterviewObject(sourceKey, destinationKey, `video/${ext}`);
  return destinationKey;
}

async function getSharedInterviewMediaKeys(positionId, db = pool) {
  const result = await db.query(
    `WITH target_keys AS (
       SELECT intro_video_key AS s3_key
       FROM interview_position
       WHERE position_id = $1 AND intro_video_key IS NOT NULL
       UNION
       SELECT farewell_video_key AS s3_key
       FROM interview_position
       WHERE position_id = $1 AND farewell_video_key IS NOT NULL
       UNION
       SELECT video_key AS s3_key
       FROM interview_position_question
       WHERE position_id = $1 AND video_key IS NOT NULL
     ),
     other_refs AS (
       SELECT intro_video_key AS s3_key
       FROM interview_position
       WHERE position_id <> $1 AND intro_video_key IS NOT NULL
       UNION ALL
       SELECT farewell_video_key AS s3_key
       FROM interview_position
       WHERE position_id <> $1 AND farewell_video_key IS NOT NULL
       UNION ALL
       SELECT video_key AS s3_key
       FROM interview_position_question
       WHERE position_id <> $1 AND video_key IS NOT NULL
     )
     SELECT DISTINCT t.s3_key
     FROM target_keys t
     JOIN other_refs o ON o.s3_key = t.s3_key`,
    [positionId],
  );

  return new Set(result.rows.map((row) => row.s3_key).filter(Boolean));
}

async function ensurePositionInScope(positionId, db = pool) {
  const result = await db.query(
    `SELECT position_id
     FROM interview_position
     WHERE position_id = $1
       AND (interview_scope = $2 OR interview_scope IS NULL)`,
    [positionId, INTERVIEW_SCOPE],
  );

  return result.rows.length > 0;
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
    const result = await pool.query(
      `SELECT
         p.*,
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
      WHERE (p.interview_scope = $1 OR p.interview_scope IS NULL)
       ORDER BY p.updated_at DESC`,
      [INTERVIEW_SCOPE],
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
    const result = await pool.query(
      `SELECT *
       FROM interview_position
       WHERE position_id = $1
         AND (interview_scope = $2 OR interview_scope IS NULL)`,
      [positionId, INTERVIEW_SCOPE],
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Position not found" });
    }

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
      const inScope = await ensurePositionInScope(positionId);
      if (!inScope) {
        return res.status(404).json({ message: "Position not found" });
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
    role_title,
    department = "",
    location = "",
    employment_type = "",
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

  if (
    !title ||
    !role_title ||
    !Array.isArray(questions) ||
    questions.length === 0
  ) {
    return res.status(400).json({
      message: "title, role_title and at least one question are required",
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
         farewell_video_duration_seconds,
         interview_scope
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
       )
       RETURNING *`,
      [
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

async function duplicatePosition(req, res) {
  const { positionId } = req.params;
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const inScope = await ensurePositionInScope(positionId, client);
    if (!inScope) {
      return res.status(404).json({ message: "Position not found" });
    }

    const sourceResult = await client.query(
      `SELECT *
       FROM interview_position
       WHERE position_id = $1
         AND (interview_scope = $2 OR interview_scope IS NULL)`,
      [positionId, INTERVIEW_SCOPE],
    );

    if (!sourceResult.rows.length) {
      return res.status(404).json({ message: "Position not found" });
    }

    const questionResult = await client.query(
      `SELECT *
       FROM interview_position_question
       WHERE position_id = $1
       ORDER BY question_order ASC`,
      [positionId],
    );

    const source = sourceResult.rows[0];
    const finalSlug = await ensureUniqueSlug(
      `${source.slug || source.title}-copy`,
    );
    const duplicateTitle = `${source.title} (Copy)`;

    await client.query("BEGIN");
    transactionStarted = true;

    const positionInsertResult = await client.query(
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
         farewell_video_duration_seconds,
         interview_scope
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
       )
       RETURNING *`,
      [
        duplicateTitle,
        source.role_title,
        source.department || "",
        source.location || "",
        source.employment_type || "",
        source.short_description || "",
        null,
        source.intro_video_title || "",
        source.intro_video_description || "",
        null,
        source.farewell_video_title || "",
        source.farewell_video_description || "",
        source.thank_you_message || "",
        source.thinking_time_seconds ?? 3,
        source.answer_time_seconds ?? null,
        source.allowed_retakes ?? 0,
        finalSlug,
        "draft",
        req.user.user_id,
        source.intro_video_duration_seconds ?? null,
        source.farewell_video_duration_seconds ?? null,
        source.interview_scope || INTERVIEW_SCOPE,
      ],
    );

    const position = positionInsertResult.rows[0];
    const introVideoKey = await cloneInterviewMediaKey({
      sourceKey: source.intro_video_key,
      kind: "intro",
      positionId: position.position_id,
    });
    const farewellVideoKey = await cloneInterviewMediaKey({
      sourceKey: source.farewell_video_key,
      kind: "farewell",
      positionId: position.position_id,
    });

    await client.query(
      `UPDATE interview_position
       SET
         intro_video_key = $1,
         farewell_video_key = $2,
         updated_at = NOW()
       WHERE position_id = $3`,
      [introVideoKey, farewellVideoKey, position.position_id],
    );

    for (const item of questionResult.rows) {
      const copiedQuestionVideoKey = await cloneInterviewMediaKey({
        sourceKey: item.video_key,
        kind: "question",
        positionId: position.position_id,
        questionId: crypto.randomUUID(),
      });

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
          item.question_order,
          item.title,
          item.short_description || "",
          copiedQuestionVideoKey,
          item.video_duration_seconds ?? null,
        ],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const payload = await buildPositionPayload(position);
    res.status(201).json({ data: payload });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    console.error("Error duplicating interview position:", error);
    res.status(500).json({ message: "Could not duplicate interview position" });
  } finally {
    client.release();
  }
}

async function updatePosition(req, res) {
  const { positionId } = req.params;
  const inScope = await ensurePositionInScope(positionId);

  if (!inScope) {
    return res.status(404).json({ message: "Position not found" });
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
    role_title,
    department = "",
    location = "",
    employment_type = "",
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

  if (
    !title ||
    !role_title ||
    !Array.isArray(questions) ||
    questions.length === 0
  ) {
    return res.status(400).json({
      message: "title, role_title and at least one question are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const finalSlug = await ensureUniqueSlug(
      slug || generateShortSlug(),
      positionId,
    );

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
      WHERE position_id = $19 AND (interview_scope = $22 OR interview_scope IS NULL)
       RETURNING *`,
      [
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
        thinking_time_seconds ?? 3,
        answer_time_seconds ?? null,
        allowed_retakes ?? 0,
        finalSlug,
        status,
        positionId,
        req.body.intro_video_duration_seconds ?? null,
        req.body.farewell_video_duration_seconds ?? null,
        INTERVIEW_SCOPE,
      ],
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
    const result = await pool.query(
      `UPDATE interview_position
       SET status = $1, updated_at = NOW()
      WHERE position_id = $2 AND (interview_scope = $3 OR interview_scope IS NULL)
       RETURNING *`,
      [status, positionId, INTERVIEW_SCOPE],
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
    const inScope = await ensurePositionInScope(positionId);
    if (!inScope) {
      return res.status(404).json({ message: "Position not found" });
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
    const inScope = await ensurePositionInScope(positionId);
    if (!inScope) {
      return res.status(404).json({ message: "Position not found" });
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
      answersResult.rows.map(async (row) => {
        const questionVideoFileName = row.question_video_key
          ? `interview-question-${row.question_order || "video"}.${String(
              row.question_video_key,
            )
              .split(".")
              .pop() || "webm"}`
          : null;
        const answerVideoFileName = row.answer_video_key
          ? `candidate-answer-${row.question_order || "video"}.${String(
              row.answer_video_key,
            )
              .split(".")
              .pop() || "webm"}`
          : null;

        return {
          ...row,
          question_video_url: await getInterviewDownloadUrl(
            row.question_video_key,
          ),
          answer_video_url: await getInterviewDownloadUrl(row.answer_video_key),
          question_video_download_url: await getInterviewDownloadUrl(
            row.question_video_key,
            {
              asAttachment: true,
              fileName: questionVideoFileName,
            },
          ),
          answer_video_download_url: await getInterviewDownloadUrl(
            row.answer_video_key,
            {
              asAttachment: true,
              fileName: answerVideoFileName,
            },
          ),
        };
      }),
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
    const inScope = await ensurePositionInScope(positionId, client);
    if (!inScope) {
      return res.status(404).json({ message: "Position not found" });
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
    const positionResult = await client.query(
      `SELECT position_id, intro_video_key, farewell_video_key
       FROM interview_position
       WHERE position_id = $1 AND (interview_scope = $2 OR interview_scope IS NULL)`,
      [positionId, INTERVIEW_SCOPE],
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

    const sharedKeys = await getSharedInterviewMediaKeys(positionId, client);
    const safeDirectKeys = directKeys.filter(
      (key) => key && !sharedKeys.has(key),
    );

    await deleteInterviewObjects([...safeDirectKeys, ...prefixKeys.flat()]);

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
  duplicatePosition,
  updatePosition,
  updatePositionStatus,
  getCandidatesByPosition,
  getCandidateSubmissionDetail,
  reviewCandidateSubmission,
  deletePosition,
};
