const { pool } = require("../util/db");
const {
  getInterviewDownloadUrl,
  getInterviewUploadUrl,
} = require("../config/interviewS3");
const {
  generateSessionToken,
  buildInterviewStorageKey,
  parseFileExtension,
} = require("../util/interviewToolsUtils");

async function getPositionWithQuestionsBySlug(slug) {
  const positionResult = await pool.query(
    `SELECT * FROM interview_position WHERE slug = $1`,
    [slug],
  );

  if (!positionResult.rows.length) {
    return null;
  }

  const position = positionResult.rows[0];
  const questionResult = await pool.query(
    `SELECT *
     FROM interview_position_question
     WHERE position_id = $1
     ORDER BY question_order ASC`,
    [position.position_id],
  );

  const questions = await Promise.all(
    questionResult.rows.map(async (row) => ({
      question_id: row.question_id,
      question_order: row.question_order,
      title: row.title,
      short_description: row.short_description,
      video_url: await getInterviewDownloadUrl(row.video_key),
      video_duration_seconds: row.video_duration_seconds,
    })),
  );

  return {
    ...position,
    intro_video_url: await getInterviewDownloadUrl(position.intro_video_key),
    intro_video_duration_seconds: position.intro_video_duration_seconds,
    farewell_video_url: await getInterviewDownloadUrl(
      position.farewell_video_key,
    ),
    farewell_video_duration_seconds: position.farewell_video_duration_seconds,
    questions,
  };
}

async function getPublicPosition(req, res) {
  const { slug } = req.params;

  try {
    const position = await getPositionWithQuestionsBySlug(slug);

    if (!position) {
      return res.status(404).json({ message: "Interview not found" });
    }

    if (position.status === "published_closed") {
      return res.status(200).json({
        data: {
          slug: position.slug,
          title: position.title,
          role_title: position.role_title,
          status: "published_closed",
        },
      });
    }

    if (position.status !== "published_open") {
      return res.status(404).json({ message: "Interview not found" });
    }

    res.status(200).json({
      data: {
        position_id: position.position_id,
        slug: position.slug,
        title: position.title,
        role_title: position.role_title,
        department: position.department,
        location: position.location,
        employment_type: position.employment_type,
        short_description: position.short_description,
        intro_video_url: position.intro_video_url,
        intro_video_duration_seconds: position.intro_video_duration_seconds,
        intro_video_title: position.intro_video_title,
        intro_video_description: position.intro_video_description,
        farewell_video_url: position.farewell_video_url,
        farewell_video_duration_seconds:
          position.farewell_video_duration_seconds,
        farewell_video_title: position.farewell_video_title,
        farewell_video_description: position.farewell_video_description,
        thank_you_message: position.thank_you_message,
        thinking_time_seconds: position.thinking_time_seconds ?? 3,
        answer_time_seconds: position.answer_time_seconds,
        overall_time_limit_minutes: position.overall_time_limit_minutes ?? null,
        allowed_retakes: position.allowed_retakes ?? 0,
        questions: position.questions,
      },
    });
  } catch (error) {
    console.error("Error fetching public interview:", error);
    res.status(500).json({ message: "Could not fetch interview" });
  }
}

async function startSubmission(req, res) {
  const { slug } = req.params;
  const {
    candidate_name,
    candidate_email,
    candidate_phone,
    existing_session_token = null,
  } = req.body;

  if (!candidate_name || !candidate_email || !candidate_phone) {
    return res.status(400).json({
      message:
        "candidate_name, candidate_email and candidate_phone are required",
    });
  }

  try {
    const position = await getPositionWithQuestionsBySlug(slug);

    if (!position || position.status !== "published_open") {
      return res.status(404).json({ message: "Interview not available" });
    }

    if (existing_session_token) {
      const resumeResult = await pool.query(
        `SELECT *
         FROM interview_submission
         WHERE position_id = $1
           AND session_token = $2
           AND status = 'started'`,
        [position.position_id, existing_session_token],
      );

      if (resumeResult.rows.length) {
        return res.status(200).json({
          data: {
            submission: resumeResult.rows[0],
            position: {
              position_id: position.position_id,
              slug: position.slug,
              title: position.title,
              role_title: position.role_title,
              intro_video_url: position.intro_video_url,
              intro_video_duration_seconds:
                position.intro_video_duration_seconds,
              intro_video_title: position.intro_video_title,
              intro_video_description: position.intro_video_description,
              farewell_video_url: position.farewell_video_url,
              farewell_video_duration_seconds:
                position.farewell_video_duration_seconds,
              farewell_video_title: position.farewell_video_title,
              farewell_video_description: position.farewell_video_description,
              thank_you_message: position.thank_you_message,
              thinking_time_seconds: position.thinking_time_seconds ?? 3,
              answer_time_seconds: position.answer_time_seconds,
              overall_time_limit_minutes: position.overall_time_limit_minutes ?? null,
              allowed_retakes: position.allowed_retakes ?? 0,
              questions: position.questions,
            },
          },
        });
      }
    }

    const completedCheck = await pool.query(
      `SELECT submission_id
       FROM interview_submission
       WHERE position_id = $1
         AND status = 'completed'
         AND (
           LOWER(candidate_email) = LOWER($2)
           OR candidate_phone = $3
         )`,
      [position.position_id, candidate_email, candidate_phone],
    );

    if (completedCheck.rows.length) {
      return res.status(409).json({
        message:
          "This email or phone number has already submitted this interview",
      });
    }

    await pool.query(
      `UPDATE interview_submission
       SET status = 'abandoned', last_saved_at = NOW()
       WHERE position_id = $1
         AND status = 'started'
         AND (
           LOWER(candidate_email) = LOWER($2)
           OR candidate_phone = $3
         )`,
      [position.position_id, candidate_email, candidate_phone],
    );

    const sessionToken = generateSessionToken();

    const insertResult = await pool.query(
      `INSERT INTO interview_submission (
         position_id,
         candidate_name,
         candidate_email,
         candidate_phone,
         session_token,
         status,
         current_question_index,
         total_questions
       )
       VALUES ($1, $2, $3, $4, $5, 'started', 0, $6)
       RETURNING *`,
      [
        position.position_id,
        candidate_name,
        candidate_email,
        candidate_phone,
        sessionToken,
        position.questions.length,
      ],
    );

    res.status(201).json({
      data: {
        submission: insertResult.rows[0],
        position: {
          position_id: position.position_id,
          slug: position.slug,
          title: position.title,
          role_title: position.role_title,
          intro_video_url: position.intro_video_url,
          intro_video_title: position.intro_video_title,
          intro_video_description: position.intro_video_description,
          farewell_video_url: position.farewell_video_url,
          farewell_video_title: position.farewell_video_title,
          farewell_video_description: position.farewell_video_description,
          thank_you_message: position.thank_you_message,
          thinking_time_seconds: position.thinking_time_seconds ?? 3,
          answer_time_seconds: position.answer_time_seconds,
          overall_time_limit_minutes: position.overall_time_limit_minutes ?? null,
          allowed_retakes: position.allowed_retakes ?? 0,
          questions: position.questions,
        },
      },
    });
  } catch (error) {
    console.error("Error starting interview submission:", error);
    res.status(500).json({ message: "Could not start interview" });
  }
}

async function restoreSubmission(req, res) {
  const { slug, sessionToken } = req.params;

  try {
    const position = await getPositionWithQuestionsBySlug(slug);

    if (!position || position.status !== "published_open") {
      return res.status(404).json({ message: "Interview not available" });
    }

    const submissionResult = await pool.query(
      `SELECT *
       FROM interview_submission
       WHERE position_id = $1
         AND session_token = $2
         AND status = 'started'`,
      [position.position_id, sessionToken],
    );

    if (!submissionResult.rows.length) {
      return res.status(404).json({ message: "Interview session not found" });
    }

    const answersResult = await pool.query(
      `SELECT question_id, answer_video_key, answer_duration_seconds, retake_count
       FROM interview_submission_answer
       WHERE submission_id = $1`,
      [submissionResult.rows[0].submission_id],
    );

    res.status(200).json({
      data: {
        submission: submissionResult.rows[0],
        answers: answersResult.rows,
        position: {
          position_id: position.position_id,
          slug: position.slug,
          title: position.title,
          role_title: position.role_title,
          intro_video_url: position.intro_video_url,
          intro_video_title: position.intro_video_title,
          intro_video_description: position.intro_video_description,
          farewell_video_url: position.farewell_video_url,
          farewell_video_title: position.farewell_video_title,
          farewell_video_description: position.farewell_video_description,
          thank_you_message: position.thank_you_message,
          thinking_time_seconds: position.thinking_time_seconds ?? 3,
          answer_time_seconds: position.answer_time_seconds,
          overall_time_limit_minutes: position.overall_time_limit_minutes ?? null,
          allowed_retakes: position.allowed_retakes ?? 0,
          questions: position.questions,
        },
      },
    });
  } catch (error) {
    console.error("Error restoring interview submission:", error);
    res.status(500).json({ message: "Could not restore interview" });
  }
}

async function saveAnswer(req, res) {
  const { submissionId } = req.params;
  const {
    session_token,
    question_id,
    answer_order,
    answer_video_key,
    answer_duration_seconds,
    retake_count = 0,
    next_question_index,
  } = req.body;

  if (!session_token || !question_id || !answer_video_key) {
    return res.status(400).json({
      message: "session_token, question_id and answer_video_key are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const submissionResult = await client.query(
      `SELECT *
       FROM interview_submission
       WHERE submission_id = $1
         AND session_token = $2
         AND status = 'started'`,
      [submissionId, session_token],
    );

    if (!submissionResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Submission not found" });
    }

    await client.query(
      `INSERT INTO interview_submission_answer (
         submission_id,
         question_id,
         answer_order,
         answer_video_key,
         answer_duration_seconds,
         retake_count
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (submission_id, question_id)
       DO UPDATE SET
         answer_order = EXCLUDED.answer_order,
         answer_video_key = EXCLUDED.answer_video_key,
         answer_duration_seconds = EXCLUDED.answer_duration_seconds,
         retake_count = EXCLUDED.retake_count,
         submitted_at = NOW()`,
      [
        submissionId,
        question_id,
        answer_order,
        answer_video_key,
        answer_duration_seconds ?? null,
        retake_count,
      ],
    );

    await client.query(
      `UPDATE interview_submission
       SET current_question_index = $1, last_saved_at = NOW()
       WHERE submission_id = $2`,
      [next_question_index ?? 0, submissionId],
    );

    await client.query("COMMIT");
    res.status(200).json({ message: "Answer saved" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error saving interview answer:", error);
    res.status(500).json({ message: "Could not save answer" });
  } finally {
    client.release();
  }
}

async function createAnswerUploadUrl(req, res) {
  const { submissionId } = req.params;
  const { session_token, question_id, fileName, contentType } = req.body;

  if (!session_token || !question_id || !contentType) {
    return res.status(400).json({
      message: "session_token, question_id and contentType are required",
    });
  }

  try {
    const submissionResult = await pool.query(
      `SELECT position_id
       FROM interview_submission
       WHERE submission_id = $1
         AND session_token = $2
         AND status = 'started'`,
      [submissionId, session_token],
    );

    if (!submissionResult.rows.length) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const questionResult = await pool.query(
      `SELECT question_id
       FROM interview_position_question
       WHERE question_id = $1
         AND position_id = $2`,
      [question_id, submissionResult.rows[0].position_id],
    );

    if (!questionResult.rows.length) {
      return res.status(404).json({ message: "Question not found" });
    }

    const ext = parseFileExtension(fileName, contentType);
    const key = buildInterviewStorageKey({
      kind: "answer",
      positionId: submissionResult.rows[0].position_id,
      questionId: question_id,
      submissionId,
      ext,
    });

    const signed = await getInterviewUploadUrl({
      key,
      contentType,
      metadata: {
        kind: "answer",
        submission_id: String(submissionId),
        question_id: String(question_id),
      },
    });

    res.status(200).json({
      data: {
        ...signed,
        contentType,
      },
    });
  } catch (error) {
    console.error("Error creating answer upload url:", error);
    res.status(500).json({ message: "Could not create upload url" });
  }
}

async function finishSubmission(req, res) {
  const { submissionId } = req.params;
  const { session_token } = req.body;

  if (!session_token) {
    return res.status(400).json({ message: "session_token is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE interview_submission
       SET
         status = 'completed',
         completed_at = NOW(),
         last_saved_at = NOW()
       WHERE submission_id = $1
         AND session_token = $2
         AND status = 'started'
       RETURNING *`,
      [submissionId, session_token],
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Submission not found" });
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    console.error("Error finishing interview submission:", error);
    res.status(500).json({ message: "Could not finish interview" });
  }
}

module.exports = {
  getPublicPosition,
  startSubmission,
  restoreSubmission,
  createAnswerUploadUrl,
  saveAnswer,
  finishSubmission,
};
