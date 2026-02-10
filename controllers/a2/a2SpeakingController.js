const { pool } = require("../../util/db");

// Get all speaking chapters with progress
async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT 
        c.id, c.chapter_name, c.description, c.order_index,
        COUNT(s.id) as content_count,
        p.current_content_index, p.is_completed
      FROM a2_chapter c
      LEFT JOIN a2_speaking_content s ON s.chapter_id = c.id
      LEFT JOIN a2_speaking_progress p ON p.chapter_id = c.id AND p.user_id = $1
      WHERE c.module = 'speaking' AND c.is_active = true
      GROUP BY c.id, p.current_content_index, p.is_completed
      ORDER BY c.order_index ASC
    `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching speaking chapters:", err);
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
      SELECT id, text_de, text_en, audio_url, content_index
      FROM a2_speaking_content
      WHERE chapter_id = $1
      ORDER BY content_index ASC
    `,
      [chapterId],
    );

    const progressResult = await pool.query(
      `
      SELECT current_content_index, is_completed
      FROM a2_speaking_progress
      WHERE chapter_id = $1 AND user_id = $2
    `,
      [chapterId, userId],
    );

    res.json({
      content: contentResult.rows,
      progress: progressResult.rows[0] || {
        current_content_index: 0,
        is_completed: false,
      },
    });
  } catch (err) {
    console.error("Error fetching speaking content:", err);
    res.status(500).json({ error: "Failed to fetch content" });
  }
}

// Save progress
async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { chapterId, contentIndex, isCompleted } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a2_speaking_progress (user_id, chapter_id, current_content_index, is_completed, last_practiced)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, chapter_id)
      DO UPDATE SET current_content_index = $3, is_completed = $4, last_practiced = NOW()
    `,
      [userId, chapterId, contentIndex, isCompleted || false],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving speaking progress:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
}

// Save assessment result
async function saveAssessment(req, res) {
  const userId = req.user?.user_id;
  const { contentId, score, accuracyScore, fluencyScore, pronunciationScore } =
    req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a2_speaking_assessment (user_id, content_id, score, accuracy_score, fluency_score, pronunciation_score)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        userId,
        contentId,
        score,
        accuracyScore,
        fluencyScore,
        pronunciationScore,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving assessment:", err);
    res.status(500).json({ error: "Failed to save assessment" });
  }
}

module.exports = {
  getChapters,
  getContent,
  saveProgress,
  saveAssessment,
};
